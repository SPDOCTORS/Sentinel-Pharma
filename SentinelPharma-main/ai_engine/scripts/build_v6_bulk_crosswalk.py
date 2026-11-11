"""SentinelPharma V6 Phase 1: Build the complete bulk target crosswalk.

Uses:
- ChEMBL 36 SQLite: c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db
- UniProtKB Human ID Mapping: c:/Users/Senthil Kumar/Downloads/HUMAN_9606_idmapping_selected.tab.gz

Builds the crosswalk for all eligible clinical-drug targets (~3,250 targets):
- Curated mechanisms for clinical/approved drugs (max_phase >= 1)
- High-affinity bioactivity targets (<= 1 uM) for clinical/approved drugs
- Generates detailed coverage statistics, unresolved reasons breakdown, and full provenance.
"""
from __future__ import annotations

import gzip
import json
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


DEFAULT_DB_PATH = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db")
DEFAULT_UNIPROT_PATH = Path("c:/Users/Senthil Kumar/Downloads/HUMAN_9606_idmapping_selected.tab.gz")
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "target_crosswalks" / "v6_clinical_targets_snapshot"


class V6BulkCrosswalkBuilder:
    def __init__(
        self,
        db_path: Path = DEFAULT_DB_PATH,
        uniprot_path: Path = DEFAULT_UNIPROT_PATH,
        output_dir: Path = DEFAULT_OUTPUT_DIR,
    ):
        self.db_path = Path(db_path)
        self.uniprot_path = Path(uniprot_path)
        self.output_dir = Path(output_dir)
        self.uniprot_to_ensembl: Dict[str, List[str]] = {}
        self.uniprot_to_id: Dict[str, str] = {}
        self.chembl_gene_symbols: Dict[int, str] = {}
        self._loaded = False

    def load_sources(self) -> None:
        if self._loaded:
            return

        print(f"[V6 Bulk Builder] Loading UniProt ID mapping from: {self.uniprot_path}")
        t0 = time.time()
        with gzip.open(self.uniprot_path, "rt", encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                acc = parts[0]
                u_id = parts[1] if len(parts) > 1 else ""
                self.uniprot_to_id[acc] = u_id
                
                ens_field = parts[18] if len(parts) > 18 else ""
                genes = set()
                if ens_field.strip():
                    for item in ens_field.split(";"):
                        clean = item.strip().split(".")[0].strip()
                        if clean.startswith("ENSG"):
                            genes.add(clean)
                self.uniprot_to_ensembl[acc] = sorted(genes)

        print(f"[V6 Bulk Builder] Loaded {len(self.uniprot_to_ensembl):,} UniProt accessions in {time.time() - t0:.2f}s")

        print(f"[V6 Bulk Builder] Loading ChEMBL component gene symbols from SQLite: {self.db_path}")
        t1 = time.time()
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT component_id, component_synonym FROM component_synonyms WHERE syn_type = 'GENE_SYMBOL';")
        for cid, sym in cursor.fetchall():
            if cid not in self.chembl_gene_symbols and sym:
                self.chembl_gene_symbols[cid] = sym
        conn.close()
        print(f"[V6 Bulk Builder] Loaded {len(self.chembl_gene_symbols):,} component gene symbols in {time.time() - t1:.2f}s")
        self._loaded = True

    def get_eligible_clinical_targets(self) -> List[Dict[str, Any]]:
        """Queries all targets associated with clinical drugs (max_phase >= 1) via mechanisms OR high-affinity bioactivities."""
        self.load_sources()
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        print("[V6 Bulk Builder] Querying all eligible clinical drug targets (mechanisms + bioactivities <= 1 uM)...")
        # Query distinct target IDs associated with max_phase >= 1 drugs
        query = """
            SELECT DISTINCT td.tid, td.chembl_id, td.pref_name, td.target_type, td.organism,
                CASE WHEN dm.tid IS NOT NULL THEN 1 ELSE 0 END as has_mechanism
            FROM target_dictionary td
            LEFT JOIN (
                SELECT DISTINCT dm.tid
                FROM drug_mechanism dm
                JOIN molecule_dictionary md ON dm.molregno = md.molregno
                WHERE md.max_phase >= 1
            ) dm ON td.tid = dm.tid
            WHERE dm.tid IS NOT NULL
               OR td.tid IN (
                    SELECT DISTINCT a.tid
                    FROM activities act
                    JOIN assays a ON act.assay_id = a.assay_id
                    JOIN molecule_dictionary md ON act.molregno = md.molregno
                    WHERE md.max_phase >= 1
                      AND act.standard_type IN ('IC50', 'Ki', 'Kd', 'EC50')
                      AND act.standard_value IS NOT NULL
                      AND act.standard_value <= 1000
               )
            ORDER BY td.chembl_id;
        """
        cursor.execute(query)
        targets = []
        for row in cursor.fetchall():
            targets.append({
                "tid": row[0],
                "chemblId": row[1],
                "prefName": row[2],
                "targetType": row[3],
                "organism": row[4],
                "hasCuratedMechanism": bool(row[5]),
            })

        print(f"[V6 Bulk Builder] Discovered {len(targets):,} eligible clinical-drug targets in ChEMBL 36.")
        
        # Now fetch all target components for these targets
        tids = [t["tid"] for t in targets]
        # Batch in chunks of 900
        comp_map: Dict[int, List[Dict[str, Any]]] = {}
        for i in range(0, len(tids), 900):
            chunk = tids[i:i + 900]
            placeholders = ",".join("?" for _ in chunk)
            comp_query = f"""
                SELECT tc.tid, tc.component_id, cs.accession, cs.component_type, cs.description
                FROM target_components tc
                JOIN component_sequences cs ON tc.component_id = cs.component_id
                WHERE tc.tid IN ({placeholders});
            """
            cursor.execute(comp_query, chunk)
            for row in cursor.fetchall():
                tid, cid, acc, ctype, desc = row
                if tid not in comp_map:
                    comp_map[tid] = []
                comp_map[tid].append({
                    "componentId": cid,
                    "accession": acc,
                    "componentType": ctype,
                    "description": desc,
                })

        conn.close()

        # Attach components to targets
        for t in targets:
            t["components"] = comp_map.get(t["tid"], [])

        return targets

    def resolve_targets(self, targets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        self.load_sources()
        now_ts = datetime.now(timezone.utc).isoformat()
        resolved_entries = []

        for t in targets:
            chembl_id = t["chemblId"]
            organism = t["organism"]
            target_type = t["targetType"]
            pref_name = t["prefName"]
            raw_comps = t.get("components", [])

            # 1. Non-human target exclusion
            if organism != "Homo sapiens":
                resolved_entries.append({
                    "chemblTargetId": chembl_id,
                    "prefName": pref_name,
                    "targetType": target_type,
                    "organism": organism,
                    "targetComplexity": "NON_HUMAN",
                    "isMultiProtein": len(raw_comps) > 1,
                    "targetResolutionStatus": "UNRESOLVED",
                    "hasCuratedMechanism": t.get("hasCuratedMechanism", False),
                    "canonicalEnsemblGeneIds": [],
                    "components": [
                        {
                            "chemblTargetId": chembl_id,
                            "chemblComponentId": None,
                            "uniprotId": None,
                            "geneSymbol": None,
                            "componentType": None,
                            "isReviewed": False,
                            "reviewStatus": "NOT_APPLICABLE",
                            "mappingStatus": "UNRESOLVED",
                            "mappingMethod": "NONE",
                            "reason": "NON_HUMAN",
                            "ambiguityReason": None,
                            "ensemblGeneIds": [],
                            "provenance": {
                                "sourceArtifact": "chembl_36.db",
                                "mappedAt": now_ts,
                            },
                        }
                    ],
                    "provenance": {
                        "sourceArtifact": "chembl_36.db",
                        "mappedAt": now_ts,
                    },
                })
                continue

            # 2. Missing components handling
            if not raw_comps:
                resolved_entries.append({
                    "chemblTargetId": chembl_id,
                    "prefName": pref_name,
                    "targetType": target_type,
                    "organism": organism,
                    "targetComplexity": "SINGLE_PROTEIN",
                    "isMultiProtein": False,
                    "targetResolutionStatus": "UNRESOLVED",
                    "hasCuratedMechanism": t.get("hasCuratedMechanism", False),
                    "canonicalEnsemblGeneIds": [],
                    "components": [
                        {
                            "chemblTargetId": chembl_id,
                            "chemblComponentId": None,
                            "uniprotId": None,
                            "geneSymbol": None,
                            "componentType": None,
                            "isReviewed": False,
                            "reviewStatus": "NOT_APPLICABLE",
                            "mappingStatus": "UNRESOLVED",
                            "mappingMethod": "CHEMBL_COMPONENT_UNIPROT",
                            "reason": "NO_COMPONENT_ACCESSION",
                            "ambiguityReason": None,
                            "ensemblGeneIds": [],
                            "provenance": {
                                "sourceArtifact": "chembl_36.db",
                                "mappedAt": now_ts,
                            },
                        }
                    ],
                    "provenance": {
                        "sourceArtifact": "chembl_36.db",
                        "mappedAt": now_ts,
                    },
                })
                continue

            # 3. Classify target complexity
            is_multi = len(raw_comps) > 1 or target_type in (
                "PROTEIN COMPLEX",
                "PROTEIN COMPLEX GROUP",
                "PROTEIN FAMILY",
            )
            if target_type == "PROTEIN COMPLEX GROUP":
                complexity = "PROTEIN_COMPLEX_GROUP"
            elif target_type == "PROTEIN COMPLEX":
                complexity = "PROTEIN_COMPLEX"
            elif target_type == "PROTEIN FAMILY":
                complexity = "PROTEIN_FAMILY"
            elif is_multi:
                complexity = "MULTI_PROTEIN"
            else:
                complexity = "SINGLE_PROTEIN"

            # 4. Resolve each component
            comp_records = []
            all_canonical_genes = set()

            for c in raw_comps:
                cid = c.get("componentId")
                acc = c.get("accession")
                ctype = c.get("componentType")

                if not acc:
                    comp_records.append({
                        "chemblTargetId": chembl_id,
                        "chemblComponentId": cid,
                        "uniprotId": None,
                        "geneSymbol": None,
                        "componentType": ctype,
                        "isReviewed": False,
                        "reviewStatus": "NOT_APPLICABLE",
                        "mappingStatus": "UNRESOLVED",
                        "mappingMethod": "CHEMBL_COMPONENT_UNIPROT",
                        "reason": "NO_COMPONENT_ACCESSION",
                        "ambiguityReason": None,
                        "ensemblGeneIds": [],
                        "provenance": {
                            "sourceArtifact": "chembl_36.db",
                            "mappedAt": now_ts,
                        },
                    })
                    continue

                # Query UniProt mapping
                ensembl_genes = self.uniprot_to_ensembl.get(acc, [])
                gene_symbol = self.chembl_gene_symbols.get(cid)
                u_id = self.uniprot_to_id.get(acc, "")
                is_reviewed = True if acc in self.uniprot_to_ensembl else False

                if not ensembl_genes:
                    mapping_status = "UNRESOLVED"
                    reason = "NO_EXACT_ENSEMBL_MAPPING"
                    ambiguity_reason = None
                    mapping_method = "CHEMBL_COMPONENT_UNIPROT"
                elif len(ensembl_genes) == 1:
                    mapping_status = "EXACT"
                    reason = None
                    ambiguity_reason = None
                    mapping_method = "CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL"
                    all_canonical_genes.update(ensembl_genes)
                else:
                    mapping_status = "ONE_TO_MANY"
                    reason = None
                    ambiguity_reason = "MULTIPLE_GENE_LOCI"
                    mapping_method = "CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL"
                    all_canonical_genes.update(ensembl_genes)

                comp_records.append({
                    "chemblTargetId": chembl_id,
                    "chemblComponentId": cid,
                    "uniprotId": acc,
                    "geneSymbol": gene_symbol,
                    "componentType": ctype,
                    "isReviewed": is_reviewed,
                    "reviewStatus": "REVIEWED" if is_reviewed else "UNREVIEWED",
                    "mappingStatus": mapping_status,
                    "mappingMethod": mapping_method,
                    "reason": reason,
                    "ambiguityReason": ambiguity_reason,
                    "ensemblGeneIds": ensembl_genes,
                    "provenance": {
                        "sourceArtifact": "HUMAN_9606_idmapping_selected.tab.gz",
                        "uniprotId": u_id,
                        "mappedAt": now_ts,
                    },
                })

            # 5. Target level rollup
            statuses = [c["mappingStatus"] for c in comp_records]
            if all(s in ("EXACT", "ONE_TO_MANY") for s in statuses):
                target_status = "RESOLVED"
            elif any(s in ("EXACT", "ONE_TO_MANY") for s in statuses):
                target_status = "PARTIALLY_RESOLVED"
            else:
                target_status = "UNRESOLVED"

            resolved_entries.append({
                "chemblTargetId": chembl_id,
                "prefName": pref_name,
                "targetType": target_type,
                "organism": organism,
                "targetComplexity": complexity,
                "isMultiProtein": is_multi,
                "targetResolutionStatus": target_status,
                "hasCuratedMechanism": t.get("hasCuratedMechanism", False),
                "canonicalEnsemblGeneIds": sorted(all_canonical_genes),
                "components": comp_records,
                "provenance": {
                    "sourceArtifact": "chembl_36.db",
                    "mappedAt": now_ts,
                },
            })

        return resolved_entries

    def compute_statistics(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        total = len(entries)
        human = sum(1 for e in entries if e.get("organism") == "Homo sapiens")
        non_human = total - human

        single_prot = sum(1 for e in entries if e.get("organism") == "Homo sapiens" and not e.get("isMultiProtein"))
        multi_prot = sum(1 for e in entries if e.get("organism") == "Homo sapiens" and e.get("isMultiProtein"))

        resolved = sum(1 for e in entries if e.get("targetResolutionStatus") == "RESOLVED")
        partial = sum(1 for e in entries if e.get("targetResolutionStatus") == "PARTIALLY_RESOLVED")
        unresolved = sum(1 for e in entries if e.get("targetResolutionStatus") == "UNRESOLVED")

        # Mechanism-only targets
        mech_targets = [e for e in entries if e.get("hasCuratedMechanism")]
        mech_total = len(mech_targets)
        mech_human = sum(1 for e in mech_targets if e.get("organism") == "Homo sapiens")
        mech_resolved = sum(1 for e in mech_targets if e.get("targetResolutionStatus") in ("RESOLVED", "PARTIALLY_RESOLVED"))

        # Components
        all_comps = [c for e in entries for c in e.get("components", [])]
        total_comps = len(all_comps)
        exact_comps = sum(1 for c in all_comps if c.get("mappingStatus") == "EXACT")
        one_to_many_comps = sum(1 for c in all_comps if c.get("mappingStatus") == "ONE_TO_MANY")
        unresolved_comps = sum(1 for c in all_comps if c.get("mappingStatus") == "UNRESOLVED")

        # Unresolved breakdown
        unresolved_non_human = sum(1 for c in all_comps if c.get("reason") == "NON_HUMAN")
        unresolved_no_ens = sum(1 for c in all_comps if c.get("reason") == "NO_EXACT_ENSEMBL_MAPPING")
        unresolved_no_acc = sum(1 for c in all_comps if c.get("reason") == "NO_COMPONENT_ACCESSION")

        all_genes = set(g for e in entries for g in e.get("canonicalEnsemblGeneIds", []))

        human_res_pct = round((resolved + partial) / human * 100, 2) if human > 0 else 0.0
        exact_comp_pct = round(exact_comps / total_comps * 100, 2) if total_comps > 0 else 0.0

        return {
            "totalTargets": total,
            "humanTargets": human,
            "nonHumanTargets": non_human,
            "singleProteinTargets": single_prot,
            "multiProteinTargets": multi_prot,
            "targetResolution": {
                "resolved": resolved,
                "partiallyResolved": partial,
                "unresolved": unresolved,
                "totalUsableHuman": resolved + partial,
                "humanResolutionRatePct": human_res_pct,
            },
            "curatedMechanismTargets": {
                "total": mech_total,
                "human": mech_human,
                "usable": mech_resolved,
                "mechanismResolutionRatePct": round(mech_resolved / mech_human * 100, 2) if mech_human > 0 else 0.0,
            },
            "componentMappings": {
                "totalComponents": total_comps,
                "exact": exact_comps,
                "oneToMany": one_to_many_comps,
                "unresolved": unresolved_comps,
                "exactMappingRatePct": exact_comp_pct,
            },
            "unresolvedBreakdown": {
                "nonHuman": unresolved_non_human,
                "noEnsemblMapping": unresolved_no_ens,
                "noComponentAccession": unresolved_no_acc,
            },
            "uniqueEnsemblGenesMapped": len(all_genes),
        }

    def build_and_save(self) -> Tuple[Path, Path, Dict[str, Any]]:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        targets = self.get_eligible_clinical_targets()
        entries = self.resolve_targets(targets)
        stats = self.compute_statistics(entries)

        snapshot = {
            "version": "chembl-uniprot-ensembl-v6-bulk-clinical",
            "generationTimestamp": datetime.now(timezone.utc).isoformat(),
            "sourceArtifacts": {
                "chemblSqliteDatabase": str(self.db_path),
                "uniprotHumanIdMapping": str(self.uniprot_path),
            },
            "targetCount": len(entries),
            "coverageStatistics": stats,
            "entries": entries,
        }

        cw_path = self.output_dir / "target_crosswalk.json"
        print(f"[V6 Bulk Builder] Writing full crosswalk to: {cw_path}...")
        with open(cw_path, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2)

        stats_path = self.output_dir / "coverage_statistics.json"
        print(f"[V6 Bulk Builder] Writing coverage statistics to: {stats_path}...")
        stats_payload = {
            "version": snapshot["version"],
            "generationTimestamp": snapshot["generationTimestamp"],
            "targetCount": snapshot["targetCount"],
            "coverageStatistics": stats,
        }
        with open(stats_path, "w", encoding="utf-8") as f:
            json.dump(stats_payload, f, indent=2)

        return cw_path, stats_path, stats


def main():
    builder = V6BulkCrosswalkBuilder()
    cw_path, stats_path, stats = builder.build_and_save()

    print("\n==================== V6 Bulk Crosswalk Report ====================")
    print(f"Total Eligible Clinical Targets:   {stats['totalTargets']:,}")
    print(f"  Human Targets:                   {stats['humanTargets']:,}")
    print(f"  Non-Human Pathogen Targets:      {stats['nonHumanTargets']:,}")
    print(f"Human Target Resolution:")
    print(f"  Fully Resolved:                  {stats['targetResolution']['resolved']:,}")
    print(f"  Partially Resolved:              {stats['targetResolution']['partiallyResolved']:,}")
    print(f"  Unresolved (Human):              {stats['targetResolution']['unresolved'] - stats['nonHumanTargets']:,}")
    print(f"  Total Usable Human Targets:      {stats['targetResolution']['totalUsableHuman']:,} ({stats['targetResolution']['humanResolutionRatePct']}%)")
    print(f"Curated Mechanism Targets:")
    print(f"  Total:                           {stats['curatedMechanismTargets']['total']:,}")
    print(f"  Human Usable:                    {stats['curatedMechanismTargets']['usable']:,} ({stats['curatedMechanismTargets']['mechanismResolutionRatePct']}%)")
    print(f"Component Mappings:")
    print(f"  Total Subunits:                  {stats['componentMappings']['totalComponents']:,}")
    print(f"  Exact (1:1):                     {stats['componentMappings']['exact']:,} ({stats['componentMappings']['exactMappingRatePct']}%)")
    print(f"  One-to-Many:                     {stats['componentMappings']['oneToMany']:,}")
    print(f"  Unresolved:                      {stats['componentMappings']['unresolved']:,}")
    print(f"    - Non-Human:                   {stats['unresolvedBreakdown']['nonHuman']:,}")
    print(f"    - No Ensembl Mapping:          {stats['unresolvedBreakdown']['noEnsemblMapping']:,}")
    print(f"    - No Component Accession:      {stats['unresolvedBreakdown']['noComponentAccession']:,}")
    print(f"Unique Canonical Ensembl Genes:    {stats['uniqueEnsemblGenesMapped']:,}")
    print(f"Crosswalk Snapshot:                {cw_path}")
    print(f"Coverage Report:                   {stats_path}")
    print("===================================================================\n")


if __name__ == "__main__":
    main()
