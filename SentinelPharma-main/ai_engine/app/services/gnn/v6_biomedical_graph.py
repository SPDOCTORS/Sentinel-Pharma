"""SentinelPharma V6 Biomedical Graph Builder.

Builds the reproducible V6 knowledge graph using:
- ChEMBL 36 SQLite (clinical drugs max_phase >= 1, curated mechanisms, bioactivities <= 1 uM)
- V6 Target Crosswalk (v6_clinical_targets_snapshot/target_crosswalk.json)
- Open Targets 26.06 Direct Associations (score >= 0.3, >= 3 distinct trusted genes per disease)
- Reactome 97 Human Pathways (Ensembl2Reactome.txt)

Core Architectural Principles:
1. Message-passing relation types are strictly separated:
   - DRUG_TARGET_CURATED_MECHANISM
   - DRUG_TARGET_BIOACTIVITY
   - DISEASE_TARGET
   - TARGET_PATHWAY
2. No message-passing data leakage:
   - Indication labels (DRUG_INDICATION) are strictly excluded from graph.json relations
   - Saved into a separate supervision file: supervision_indications.json
3. Ambiguous mappings (1:many gene loci) are strictly excluded from graph.json
   - Saved into a separate audit file: ambiguous_mappings.json
4. Deterministic content hashing (datasetHash) over canonical sorted entities and relations.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq


DEFAULT_DB_PATH = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db")
DEFAULT_CROSSWALK_PATH = Path(__file__).resolve().parents[3] / "artifacts" / "target_crosswalks" / "v6_clinical_targets_snapshot" / "target_crosswalk.json"
DEFAULT_OPEN_TARGETS_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "open_targets" / "26.06"
DEFAULT_REACTOME_PATH = Path("c:/Users/Senthil Kumar/Downloads/Ensembl2Reactome.txt")
DEFAULT_OUTPUT_BASE = Path(__file__).resolve().parents[3] / "artifacts" / "biomedical_graph" / "v6_production"


def normalize_disease_canonical(raw_id: str) -> str:
    """Standardizes disease identifiers into canonical prefix:id form."""
    raw = raw_id.strip()
    if ":" in raw:
        return raw
    if raw.startswith("EFO_"):
        return f"EFO:{raw[4:]}"
    if raw.startswith("MONDO_"):
        return f"MONDO:{raw[6:]}"
    if raw.startswith("DOID_"):
        return f"DOID:{raw[5:]}"
    if raw.startswith("Orphanet_"):
        return f"Orphanet:{raw[9:]}"
    if raw.startswith("HP_"):
        return f"HP:{raw[3:]}"
    if raw.startswith("OTAR_"):
        return f"OTAR:{raw[5:]}"
    return f"EFO:{raw}"


def dataset_hash(entities: List[Dict[str, Any]], relations: List[Dict[str, Any]]) -> str:
    """Hashes deterministic biomedical content, stripping non-deterministic timestamps."""
    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != "retrievedAt"}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    payload = json.dumps(clean({"entities": entities, "relations": relations}), sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class V6BiomedicalGraphBuilder:
    def __init__(
        self,
        db_path: Path = DEFAULT_DB_PATH,
        crosswalk_path: Path = DEFAULT_CROSSWALK_PATH,
        open_targets_dir: Path = DEFAULT_OPEN_TARGETS_DIR,
        reactome_path: Path = DEFAULT_REACTOME_PATH,
        min_ot_score: float = 0.3,
        min_ot_genes: int = 3,
    ):
        self.db_path = Path(db_path)
        self.crosswalk_path = Path(crosswalk_path)
        self.open_targets_dir = Path(open_targets_dir)
        self.reactome_path = Path(reactome_path)
        self.min_ot_score = min_ot_score
        self.min_ot_genes = min_ot_genes

    def build_graph(self) -> Dict[str, Any]:
        """Constructs canonical V6 entities, message-passing relations, supervision indications, and manifests."""
        t0 = time.time()
        print(f"[V6 Graph Build] Initializing with score >= {self.min_ot_score} and >= {self.min_ot_genes} genes per disease...")

        # 1. Ingest Crosswalk
        with open(self.crosswalk_path, "r", encoding="utf-8") as f:
            cw_data = json.load(f)

        trusted_target_to_genes: Dict[str, Set[str]] = {}
        ambiguous_target_to_genes: Dict[str, Set[str]] = {}
        gene_to_symbol: Dict[str, str] = {}
        all_trusted_genes: Set[str] = set()

        for entry in cw_data["entries"]:
            tid = entry["chemblTargetId"]
            if entry["organism"] != "Homo sapiens":
                continue
            for comp in entry.get("components", []):
                st = comp.get("mappingStatus")
                genes = comp.get("ensemblGeneIds", [])
                sym = comp.get("geneSymbol")
                if st == "EXACT":
                    trusted_target_to_genes.setdefault(tid, set()).update(genes)
                    for g in genes:
                        all_trusted_genes.add(g)
                        if sym and g not in gene_to_symbol:
                            gene_to_symbol[g] = sym
                elif st == "ONE_TO_MANY":
                    ambiguous_target_to_genes.setdefault(tid, set()).update(genes)

        print(f"  Crosswalk: {len(all_trusted_genes):,} trusted genes, {len(ambiguous_target_to_genes)} ambiguous targets.")

        # 2. Ingest ChEMBL Drugs, Mechanisms, Bioactivities, Indications
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        c = conn.cursor()

        c.execute("SELECT molregno, chembl_id, pref_name, max_phase FROM molecule_dictionary WHERE max_phase >= 1;")
        drugs_meta = {row[0]: {"chemblId": row[1], "prefName": row[2] or row[1], "maxPhase": row[3]} for row in c.fetchall()}

        # Curated mechanisms
        c.execute("""
            SELECT dm.molregno, td.chembl_id, dm.mechanism_of_action, dm.action_type
            FROM drug_mechanism dm
            JOIN molecule_dictionary md ON dm.molregno = md.molregno
            JOIN target_dictionary td ON dm.tid = td.tid
            WHERE md.max_phase >= 1;
        """)
        mech_rows = c.fetchall()

        # High-affinity bioactivity (<= 1 uM) using temp table index optimization
        c.execute("CREATE TEMP TABLE clinical_mols (molregno INTEGER PRIMARY KEY);")
        c.execute("INSERT INTO clinical_mols SELECT molregno FROM molecule_dictionary WHERE max_phase >= 1;")
        c.execute("""
            SELECT cm.molregno, td.chembl_id, act.standard_type, MIN(act.standard_value)
            FROM clinical_mols cm
            JOIN activities act ON cm.molregno = act.molregno
            JOIN assays a ON act.assay_id = a.assay_id
            JOIN target_dictionary td ON a.tid = td.tid
            WHERE act.standard_type IN ('IC50', 'Ki', 'Kd', 'EC50')
              AND act.standard_value IS NOT NULL
              AND act.standard_value <= 1000
            GROUP BY cm.molregno, td.chembl_id;
        """)
        bio_rows = c.fetchall()

        # Curated indications (supervision only)
        c.execute("""
            SELECT md.chembl_id, di.efo_id, di.max_phase_for_ind
            FROM drug_indication di
            JOIN molecule_dictionary md ON di.molregno = md.molregno
            WHERE md.max_phase >= 1 AND di.efo_id IS NOT NULL;
        """)
        ind_rows = c.fetchall()
        conn.close()

        # 3. Open Targets Ingestion & Disease Filtering
        assoc_dir = self.open_targets_dir / "output" / "association_overall_direct"
        partitions = sorted(assoc_dir.glob("*.parquet"))
        gene_arr = pa.array(list(all_trusted_genes))

        disease_gene_scores: Dict[str, Dict[str, float]] = {}
        for p in partitions:
            table = pq.read_table(p, columns=["targetId", "diseaseId", "associationScore"])
            mask = pc.is_in(table["targetId"], value_set=gene_arr)
            filtered = table.filter(mask)
            for g, d, s in zip(filtered["targetId"].to_pylist(), filtered["diseaseId"].to_pylist(), filtered["associationScore"].to_pylist()):
                c_d = normalize_disease_canonical(d)
                disease_gene_scores.setdefault(c_d, {})
                if g not in disease_gene_scores[c_d] or s > disease_gene_scores[c_d][g]:
                    disease_gene_scores[c_d][g] = s

        # Filter qualifying diseases: score >= min_score and distinct_genes >= min_genes
        qualifying_disease_genes: Dict[str, Dict[str, float]] = {}
        active_target_genes: Set[str] = set()

        for d, g_map in disease_gene_scores.items():
            passing = {g: s for g, s in g_map.items() if s >= self.min_ot_score}
            if len(passing) >= self.min_ot_genes:
                qualifying_disease_genes[d] = passing
                active_target_genes.update(passing.keys())

        print(f"  Open Targets: {len(qualifying_disease_genes):,} qualifying diseases with score >= {self.min_ot_score} and >= {self.min_ot_genes} genes.")

        # Disease metadata
        dis_parquet = self.open_targets_dir / "disease.parquet"
        dis_table = pq.read_table(dis_parquet, columns=["id", "name", "therapeuticAreas"])
        disease_names = {}
        disease_tas = {}
        for d_id, name, tas in zip(dis_table["id"].to_pylist(), dis_table["name"].to_pylist(), dis_table["therapeuticAreas"].to_pylist()):
            c_d = normalize_disease_canonical(d_id)
            disease_names[c_d] = name
            disease_tas[c_d] = tas or []

        # 4. Ingest Reactome 97 Pathways for active target genes
        gene_to_pathways: Dict[str, List[Tuple[str, str]]] = {}
        with open(self.reactome_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 6 and parts[5] == "Homo sapiens":
                    g, p_id, url, p_name, ev, _ = parts[:6]
                    if g in all_trusted_genes:
                        gene_to_pathways.setdefault(g, []).append((p_id, p_name))

        # 5. Build Graph Entities & Relations
        entity_map: Dict[str, Dict[str, Any]] = {}
        relation_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

        now_ts = datetime.now(timezone.utc).isoformat()

        # A) Add DRUG_TARGET_CURATED_MECHANISM relations
        curated_drug_targets: Set[Tuple[str, str]] = set()
        for molregno, tid, mech, act_type in mech_rows:
            d_id = drugs_meta[molregno]["chemblId"]
            d_canon = f"CHEMBL:{d_id}"
            if tid in trusted_target_to_genes:
                for g in trusted_target_to_genes[tid]:
                    g_canon = f"ENSEMBL:{g}"
                    curated_drug_targets.add((d_id, g))
                    
                    # Ensure drug entity
                    if d_canon not in entity_map:
                        entity_map[d_canon] = {
                            "canonicalId": d_canon,
                            "entityType": "DRUG",
                            "name": drugs_meta[molregno]["prefName"],
                            "aliases": [],
                            "sourceIds": {"ChEMBL": d_canon},
                            "provenance": [{"source": "ChEMBL", "retrievedAt": now_ts, "maxPhase": drugs_meta[molregno]["maxPhase"]}],
                        }
                    # Ensure target entity
                    if g_canon not in entity_map:
                        entity_map[g_canon] = {
                            "canonicalId": g_canon,
                            "entityType": "TARGET",
                            "name": gene_to_symbol.get(g, g),
                            "aliases": [gene_to_symbol[g]] if g in gene_to_symbol else [],
                            "sourceIds": {"Ensembl": g_canon},
                            "provenance": [{"source": "Ensembl", "retrievedAt": now_ts}],
                        }
                    # Relation
                    edge_key = (d_canon, g_canon, "DRUG_TARGET_CURATED_MECHANISM")
                    if edge_key not in relation_map:
                        relation_map[edge_key] = {
                            "source": d_canon,
                            "target": g_canon,
                            "relationType": "DRUG_TARGET_CURATED_MECHANISM",
                            "provenance": [{
                                "source": "ChEMBL",
                                "evidenceLevel": "CURATED_MECHANISM",
                                "metadata": {"mechanism": mech, "actionType": act_type},
                                "retrievedAt": now_ts,
                            }],
                        }

        # B) Add DRUG_TARGET_BIOACTIVITY relations (disjoint from curated mechanism)
        for molregno, tid, s_type, s_val in bio_rows:
            d_id = drugs_meta[molregno]["chemblId"]
            d_canon = f"CHEMBL:{d_id}"
            if tid in trusted_target_to_genes:
                for g in trusted_target_to_genes[tid]:
                    if (d_id, g) in curated_drug_targets:
                        continue  # Exclude overlap
                    g_canon = f"ENSEMBL:{g}"

                    if d_canon not in entity_map:
                        entity_map[d_canon] = {
                            "canonicalId": d_canon,
                            "entityType": "DRUG",
                            "name": drugs_meta[molregno]["prefName"],
                            "aliases": [],
                            "sourceIds": {"ChEMBL": d_canon},
                            "provenance": [{"source": "ChEMBL", "retrievedAt": now_ts, "maxPhase": drugs_meta[molregno]["maxPhase"]}],
                        }
                    if g_canon not in entity_map:
                        entity_map[g_canon] = {
                            "canonicalId": g_canon,
                            "entityType": "TARGET",
                            "name": gene_to_symbol.get(g, g),
                            "aliases": [gene_to_symbol[g]] if g in gene_to_symbol else [],
                            "sourceIds": {"Ensembl": g_canon},
                            "provenance": [{"source": "Ensembl", "retrievedAt": now_ts}],
                        }
                    edge_key = (d_canon, g_canon, "DRUG_TARGET_BIOACTIVITY")
                    if edge_key not in relation_map:
                        relation_map[edge_key] = {
                            "source": d_canon,
                            "target": g_canon,
                            "relationType": "DRUG_TARGET_BIOACTIVITY",
                            "provenance": [{
                                "source": "ChEMBL",
                                "evidenceLevel": "HIGH_AFFINITY_BIOACTIVITY",
                                "metadata": {"standardType": s_type, "standardValue": s_val},
                                "retrievedAt": now_ts,
                            }],
                        }

        # C) Add DISEASE_TARGET relations (Open Targets score >= min_ot_score)
        for d_canon, g_map in qualifying_disease_genes.items():
            d_name = disease_names.get(d_canon, d_canon)
            if d_canon not in entity_map:
                entity_map[d_canon] = {
                    "canonicalId": d_canon,
                    "entityType": "DISEASE",
                    "name": d_name,
                    "aliases": [],
                    "sourceIds": {"OpenTargets": d_canon},
                    "provenance": [{"source": "OpenTargets", "retrievedAt": now_ts, "therapeuticAreas": disease_tas.get(d_canon, [])}],
                }
            for g, score in g_map.items():
                g_canon = f"ENSEMBL:{g}"
                if g_canon not in entity_map:
                    entity_map[g_canon] = {
                        "canonicalId": g_canon,
                        "entityType": "TARGET",
                        "name": gene_to_symbol.get(g, g),
                        "aliases": [gene_to_symbol[g]] if g in gene_to_symbol else [],
                        "sourceIds": {"Ensembl": g_canon},
                        "provenance": [{"source": "Ensembl", "retrievedAt": now_ts}],
                    }
                edge_key = (d_canon, g_canon, "DISEASE_TARGET")
                if edge_key not in relation_map:
                    relation_map[edge_key] = {
                        "source": d_canon,
                        "target": g_canon,
                        "relationType": "DISEASE_TARGET",
                        "provenance": [{
                            "source": "OpenTargets",
                            "evidenceLevel": "SOURCE_ASSOCIATION",
                            "metadata": {"associationScore": score, "minScore": self.min_ot_score},
                            "retrievedAt": now_ts,
                        }],
                    }

        # D) Add TARGET_PATHWAY relations (for active genes present in entity_map)
        active_target_canonicals = set(e_id for e_id, e in entity_map.items() if e["entityType"] == "TARGET")
        for g_canon in active_target_canonicals:
            g = g_canon.replace("ENSEMBL:", "")
            for p_id, p_name in gene_to_pathways.get(g, []):
                p_canon = f"REACTOME:{p_id}"
                if p_canon not in entity_map:
                    entity_map[p_canon] = {
                        "canonicalId": p_canon,
                        "entityType": "PATHWAY",
                        "name": p_name,
                        "aliases": [],
                        "sourceIds": {"Reactome": p_canon},
                        "provenance": [{"source": "Reactome", "retrievedAt": now_ts}],
                    }
                edge_key = (g_canon, p_canon, "TARGET_PATHWAY")
                if edge_key not in relation_map:
                    relation_map[edge_key] = {
                        "source": g_canon,
                        "target": p_canon,
                        "relationType": "TARGET_PATHWAY",
                        "provenance": [{
                            "source": "Reactome",
                            "evidenceLevel": "CURATED_PATHWAY",
                            "retrievedAt": now_ts,
                        }],
                    }

        # 6. Build Supervision Indications (Strictly separate from message-passing relations)
        supervision_indications: List[Dict[str, Any]] = []
        for d_id, efo_id, max_p in ind_rows:
            d_canon = f"CHEMBL:{d_id}"
            dis_canon = normalize_disease_canonical(efo_id)
            # Only include pairs where both drug and disease are in the V6 entity graph
            if d_canon in entity_map and dis_canon in entity_map:
                supervision_indications.append({
                    "drug": d_canon,
                    "disease": dis_canon,
                    "maxPhaseForInd": max_p,
                    "evidenceLevel": "CURATED_INDICATION",
                    "provenance": {"source": "ChEMBL", "retrievedAt": now_ts},
                })

        # Deduplicate supervision indications
        seen_ind = set()
        unique_supervision_indications = []
        for item in supervision_indications:
            k = (item["drug"], item["disease"])
            if k not in seen_ind:
                seen_ind.add(k)
                unique_supervision_indications.append(item)

        # 7. Canonical Sorting and Hashing
        entities = sorted(entity_map.values(), key=lambda e: (e["entityType"], e["canonicalId"]))
        relations = sorted(relation_map.values(), key=lambda r: (r["relationType"], r["source"], r["target"]))
        content_hash = dataset_hash(entities, relations)

        # Degree calculation and isolated entities check
        degree_counter = Counter()
        for r in relations:
            degree_counter[r["source"]] += 1
            degree_counter[r["target"]] += 1

        isolated_entities = [e["canonicalId"] for e in entities if degree_counter[e["canonicalId"]] == 0]

        type_counts = Counter(e["entityType"] for e in entities)
        rel_counts = Counter(r["relationType"] for r in relations)

        elapsed = time.time() - t0

        quality_report = {
            "totalEntities": len(entities),
            "entitiesByType": dict(type_counts),
            "totalRelations": len(relations),
            "relationsByType": dict(rel_counts),
            "isolatedEntitiesCount": len(isolated_entities),
            "isolatedEntitiesSample": isolated_entities[:10],
            "degree": {
                "min": min(degree_counter.values(), default=0),
                "max": max(degree_counter.values(), default=0),
                "mean": round(sum(degree_counter.values()) / len(degree_counter), 2) if degree_counter else 0.0,
            },
            "supervisionIndications": {
                "totalCuratedPairsInChEMBL": len(ind_rows),
                "pairsWithBothEndpointsInV6Graph": len(unique_supervision_indications),
                "note": "Indication labels are isolated in supervision_indications.json to prevent message-passing leakage.",
            },
            "filterConfiguration": {
                "openTargetsMinScore": self.min_ot_score,
                "openTargetsMinGenesPerDisease": self.min_ot_genes,
                "bioactivityMaxStandardValue": 1000.0,
                "ambiguousMappingsExcluded": True,
            },
            "datasetHash": content_hash,
            "buildElapsedSec": round(elapsed, 2),
        }

        # Ambiguous mappings separate payload
        ambiguous_payload = {
            "ambiguousTargetCount": len(ambiguous_target_to_genes),
            "ambiguousTargets": {tid: sorted(genes) for tid, genes in sorted(ambiguous_target_to_genes.items())},
            "policy": "Ambiguous 1:many gene loci mappings are strictly excluded from message-passing graph edges to preserve pathway validity.",
        }

        return {
            "datasetVersion": "biomedical_graph_v6",
            "generationTimestamp": now_ts,
            "datasetHash": content_hash,
            "qualityReport": quality_report,
            "entities": entities,
            "relations": relations,
            "supervisionIndications": unique_supervision_indications,
            "ambiguousMappings": ambiguous_payload,
        }

    def save_artifacts(self, graph_payload: Dict[str, Any], output_dir: Optional[Path] = None) -> Tuple[Path, Path, Path, Path, Path]:
        """Saves graph.json, quality_report.json, supervision_indications.json, ambiguous_mappings.json, and source_manifest.json."""
        out_dir = Path(output_dir) if output_dir else DEFAULT_OUTPUT_BASE / f"biomedical_graph_v6_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        out_dir.mkdir(parents=True, exist_ok=True)

        # 1. graph.json (Contains entities, relations, datasetHash, qualityReport)
        graph_file = out_dir / "graph.json"
        graph_data = {
            "datasetVersion": graph_payload["datasetVersion"],
            "generationTimestamp": graph_payload["generationTimestamp"],
            "datasetHash": graph_payload["datasetHash"],
            "qualityReport": graph_payload["qualityReport"],
            "entities": graph_payload["entities"],
            "relations": graph_payload["relations"],
        }
        with open(graph_file, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, indent=2)

        # 2. quality_report.json (Standalone quality metrics)
        quality_file = out_dir / "quality_report.json"
        with open(quality_file, "w", encoding="utf-8") as f:
            json.dump(graph_payload["qualityReport"], f, indent=2)

        # 3. supervision_indications.json (Supervision labels isolated from message-passing edges)
        supervision_file = out_dir / "supervision_indications.json"
        with open(supervision_file, "w", encoding="utf-8") as f:
            json.dump({
                "datasetVersion": graph_payload["datasetVersion"],
                "datasetHash": graph_payload["datasetHash"],
                "totalPairs": len(graph_payload["supervisionIndications"]),
                "indications": graph_payload["supervisionIndications"],
            }, f, indent=2)

        # 4. ambiguous_mappings.json (Excluded ambiguous targets)
        ambiguous_file = out_dir / "ambiguous_mappings.json"
        with open(ambiguous_file, "w", encoding="utf-8") as f:
            json.dump(graph_payload["ambiguousMappings"], f, indent=2)

        # 5. source_manifest.json (Provenance and source manifest)
        manifest_file = out_dir / "source_manifest.json"
        manifest_data = {
            "datasetVersion": graph_payload["datasetVersion"],
            "generationTimestamp": graph_payload["generationTimestamp"],
            "datasetHash": graph_payload["datasetHash"],
            "sources": {
                "chembl": {"release": "36", "file": str(self.db_path)},
                "crosswalk": {"version": "v6-bulk-clinical", "file": str(self.crosswalk_path)},
                "openTargets": {"release": "26.06", "directory": str(self.open_targets_dir)},
                "reactome": {"release": "97", "file": str(self.reactome_path)},
            },
            "qualityReport": graph_payload["qualityReport"],
        }
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)

        return graph_file, quality_file, supervision_file, ambiguous_file, manifest_file
