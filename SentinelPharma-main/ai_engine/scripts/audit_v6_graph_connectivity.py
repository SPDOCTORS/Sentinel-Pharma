"""SentinelPharma V6 Phase 2: Read-Only Graph Connectivity Audit.

Joins:
1. Full V6 ChEMBL crosswalk (target_crosswalk.json)
2. ChEMBL 36 SQLite: clinical drugs (max_phase >= 1), curated mechanisms, and bioactivities (<= 1 uM)
3. Open Targets 26.06: disease.parquet and 14 association_overall_direct parquet partitions
4. Reactome 97: Ensembl2Reactome.txt human pathways

Strict requirements:
- Read-only audit: do not freeze graph, train models, modify V4/V5, or change endpoints.
- Separate curated mechanisms from bioactivity-derived associations.
- Exclude ambiguous mappings from trusted edges and report them separately.
- Measure connected drugs, diseases, genes, pathways, relation counts, and distinct (Drug -> Target -> Disease) paths.
"""
from __future__ import annotations

import gzip
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq


DB_PATH = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db")
CROSSWALK_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "target_crosswalks" / "v6_clinical_targets_snapshot" / "target_crosswalk.json"
OPEN_TARGETS_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "open_targets" / "26.06"
REACTOME_PATH = Path("c:/Users/Senthil Kumar/Downloads/Ensembl2Reactome.txt")
AUDIT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "open_targets" / "audits" / "v6_phase2_connectivity_audit.json"


def normalize_disease_id(d_id: str) -> str:
    """Normalizes disease IDs between EFO:xxxx and EFO_xxxx format."""
    return d_id.replace(":", "_").strip()


def run_connectivity_audit() -> Dict[str, Any]:
    print("=================================================================")
    print("   SentinelPharma V6 Phase 2: Graph Connectivity Audit (Read-Only)")
    print("=================================================================")
    start_time = time.time()

    # -------------------------------------------------------------------------
    # 1. Load V6 Target Crosswalk
    # -------------------------------------------------------------------------
    print(f"\n[1/5] Loading V6 target crosswalk: {CROSSWALK_PATH}")
    with open(CROSSWALK_PATH, "r", encoding="utf-8") as f:
        cw_data = json.load(f)

    trusted_target_to_genes: Dict[str, Set[str]] = {}
    ambiguous_target_to_genes: Dict[str, Set[str]] = {}
    all_trusted_genes: Set[str] = set()
    all_ambiguous_genes: Set[str] = set()

    for entry in cw_data["entries"]:
        tid = entry["chemblTargetId"]
        if entry["organism"] != "Homo sapiens":
            continue

        for comp in entry.get("components", []):
            status = comp.get("mappingStatus")
            genes = comp.get("ensemblGeneIds", [])
            if status == "EXACT":
                if tid not in trusted_target_to_genes:
                    trusted_target_to_genes[tid] = set()
                trusted_target_to_genes[tid].update(genes)
                all_trusted_genes.update(genes)
            elif status == "ONE_TO_MANY":
                if tid not in ambiguous_target_to_genes:
                    ambiguous_target_to_genes[tid] = set()
                ambiguous_target_to_genes[tid].update(genes)
                all_ambiguous_genes.update(genes)

    # Strictly disjoint ambiguous genes from trusted genes if any overlap
    all_ambiguous_only_genes = all_ambiguous_genes - all_trusted_genes
    all_eval_genes = all_trusted_genes.union(all_ambiguous_genes)

    print(f"  Total Human Targets in Crosswalk: {len(cw_data['entries']):,}")
    print(f"  Targets with Trusted (Exact 1:1) Subunits: {len(trusted_target_to_genes):,}")
    print(f"  Targets with Ambiguous (1:Many) Subunits: {len(ambiguous_target_to_genes):,}")
    print(f"  Unique Trusted Ensembl Genes: {len(all_trusted_genes):,}")
    print(f"  Unique Ambiguous-Only Ensembl Genes: {len(all_ambiguous_only_genes):,}")

    # -------------------------------------------------------------------------
    # 2. Ingest ChEMBL Drugs, Curated Mechanisms, Bioactivities, & Indications
    # -------------------------------------------------------------------------
    print(f"\n[2/5] Querying ChEMBL 36 SQLite: {DB_PATH}")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    c = conn.cursor()

    # Drugs (max_phase >= 1)
    c.execute("""
        SELECT molregno, chembl_id, pref_name, max_phase
        FROM molecule_dictionary
        WHERE max_phase >= 1;
    """)
    drugs_dict = {row[0]: {"chemblId": row[1], "prefName": row[2], "maxPhase": row[3]} for row in c.fetchall()}
    print(f"  Total Clinical/Approved Drugs (max_phase >= 1): {len(drugs_dict):,}")

    # Curated Mechanisms
    c.execute("""
        SELECT dm.molregno, td.chembl_id, dm.mechanism_of_action, dm.action_type
        FROM drug_mechanism dm
        JOIN molecule_dictionary md ON dm.molregno = md.molregno
        JOIN target_dictionary td ON dm.tid = td.tid
        WHERE md.max_phase >= 1;
    """)
    mech_rows = c.fetchall()

    trusted_curated_drug_target_edges: Set[Tuple[str, str]] = set()
    ambiguous_curated_drug_target_edges: Set[Tuple[str, str]] = set()
    drugs_with_curated_mechanism: Set[str] = set()

    for molregno, tid, mech, act_type in mech_rows:
        drug_id = drugs_dict[molregno]["chemblId"]
        drugs_with_curated_mechanism.add(drug_id)
        if tid in trusted_target_to_genes:
            for g in trusted_target_to_genes[tid]:
                trusted_curated_drug_target_edges.add((drug_id, g))
        elif tid in ambiguous_target_to_genes:
            for g in ambiguous_target_to_genes[tid]:
                ambiguous_curated_drug_target_edges.add((drug_id, g))

    print(f"  Curated Mechanism Edges:")
    print(f"    - Trusted (Exact 1:1 Target Mappings): {len(trusted_curated_drug_target_edges):,} edges across {len(set(d for d, _ in trusted_curated_drug_target_edges)):,} drugs")
    print(f"    - Ambiguous (1:Many Target Mappings):  {len(ambiguous_curated_drug_target_edges):,} edges")

    # High-Affinity Bioactivity (<= 1 uM or pChEMBL >= 6)
    print("  Querying high-affinity bioactivity assays (<= 1 uM)...")
    c.execute("""
        SELECT DISTINCT md.molregno, td.chembl_id
        FROM activities act
        JOIN assays a ON act.assay_id = a.assay_id
        JOIN molecule_dictionary md ON act.molregno = md.molregno
        JOIN target_dictionary td ON a.tid = td.tid
        WHERE md.max_phase >= 1
          AND act.standard_type IN ('IC50', 'Ki', 'Kd', 'EC50')
          AND act.standard_value IS NOT NULL
          AND act.standard_value <= 1000;
    """)
    bio_rows = c.fetchall()

    trusted_bioactivity_drug_target_edges: Set[Tuple[str, str]] = set()
    ambiguous_bioactivity_drug_target_edges: Set[Tuple[str, str]] = set()
    drugs_with_bioactivity: Set[str] = set()

    for molregno, tid in bio_rows:
        drug_id = drugs_dict[molregno]["chemblId"]
        drugs_with_bioactivity.add(drug_id)
        if tid in trusted_target_to_genes:
            for g in trusted_target_to_genes[tid]:
                # Exclude if already present in curated mechanism to keep distinct counts
                if (drug_id, g) not in trusted_curated_drug_target_edges:
                    trusted_bioactivity_drug_target_edges.add((drug_id, g))
        elif tid in ambiguous_target_to_genes:
            for g in ambiguous_target_to_genes[tid]:
                if (drug_id, g) not in ambiguous_curated_drug_target_edges:
                    ambiguous_bioactivity_drug_target_edges.add((drug_id, g))

    print(f"  Bioactivity-Derived Edges (Novel vs Curated):")
    print(f"    - Trusted (Exact 1:1 Target Mappings): {len(trusted_bioactivity_drug_target_edges):,} edges across {len(set(d for d, _ in trusted_bioactivity_drug_target_edges)):,} drugs")
    print(f"    - Ambiguous (1:Many Target Mappings):  {len(ambiguous_bioactivity_drug_target_edges):,} edges")

    # Curated Drug Indications
    c.execute("""
        SELECT di.molregno, di.efo_id, di.max_phase_for_ind
        FROM drug_indication di
        JOIN molecule_dictionary md ON di.molregno = md.molregno
        WHERE md.max_phase >= 1 AND di.efo_id IS NOT NULL;
    """)
    ind_rows = c.fetchall()
    conn.close()

    drug_indication_edges: Set[Tuple[str, str]] = set()
    for molregno, efo_id, max_p in ind_rows:
        if molregno in drugs_dict and efo_id:
            drug_id = drugs_dict[molregno]["chemblId"]
            norm_d = normalize_disease_id(efo_id)
            drug_indication_edges.add((drug_id, norm_d))

    print(f"  Curated Drug Indication Edges: {len(drug_indication_edges):,} edges across {len(set(d for d, _ in drug_indication_edges)):,} drugs")

    # -------------------------------------------------------------------------
    # 3. Ingest Open Targets 26.06 Disease–Target Associations
    # -------------------------------------------------------------------------
    print(f"\n[3/5] Ingesting Open Targets 26.06 associations from 14 partitions...")
    assoc_dir = OPEN_TARGETS_DIR / "output" / "association_overall_direct"
    partitions = sorted(assoc_dir.glob("*.parquet"))

    disease_target_trusted_edges: Set[Tuple[str, str]] = set()
    disease_target_ambiguous_edges: Set[Tuple[str, str]] = set()
    disease_target_trusted_confident_edges: Set[Tuple[str, str]] = set()  # score >= 0.1

    all_eval_genes_list = list(all_eval_genes)
    gene_arr = pa.array(all_eval_genes_list)

    t_ot_start = time.time()
    for i, p in enumerate(partitions, 1):
        table = pq.read_table(p, columns=["targetId", "diseaseId", "associationScore"])
        mask = pc.is_in(table["targetId"], value_set=gene_arr)
        filtered = table.filter(mask)

        t_ids = filtered["targetId"].to_pylist()
        d_ids = filtered["diseaseId"].to_pylist()
        scores = filtered["associationScore"].to_pylist()

        for g, d, s in zip(t_ids, d_ids, scores):
            norm_d = normalize_disease_id(d)
            if g in all_trusted_genes:
                disease_target_trusted_edges.add((norm_d, g))
                if s >= 0.1:
                    disease_target_trusted_confident_edges.add((norm_d, g))
            else:
                disease_target_ambiguous_edges.add((norm_d, g))

        print(f"  Processed partition {i}/{len(partitions)} ({p.name[:12]}...): {len(filtered):,} matched rows", end="\r", flush=True)

    print(f"\n  Open Targets ingestion complete in {time.time() - t_ot_start:.2f}s.")
    print(f"  Disease–Target Edges:")
    print(f"    - Trusted (All Scores > 0):       {len(disease_target_trusted_edges):,} edges across {len(set(d for d, _ in disease_target_trusted_edges)):,} diseases")
    print(f"    - Trusted (Score >= 0.1):          {len(disease_target_trusted_confident_edges):,} edges")
    print(f"    - Ambiguous (1:Many Target Genes): {len(disease_target_ambiguous_edges):,} edges")

    # Ingest Disease Metadata from disease.parquet
    dis_parquet = OPEN_TARGETS_DIR / "disease.parquet"
    print(f"  Ingesting disease metadata from: {dis_parquet}")
    dis_table = pq.read_table(dis_parquet, columns=["id", "name", "therapeuticAreas"])
    disease_metadata = {}
    for d_id, name, tas in zip(dis_table["id"].to_pylist(), dis_table["name"].to_pylist(), dis_table["therapeuticAreas"].to_pylist()):
        norm_d = normalize_disease_id(d_id)
        disease_metadata[norm_d] = {"name": name, "therapeuticAreas": tas or []}
    print(f"  Loaded metadata for {len(disease_metadata):,} diseases.")

    # -------------------------------------------------------------------------
    # 4. Ingest Reactome 97 Human Pathways
    # -------------------------------------------------------------------------
    print(f"\n[4/5] Ingesting Reactome 97 human pathways: {REACTOME_PATH}")
    t_re_start = time.time()
    gene_pathway_trusted_edges: Set[Tuple[str, str]] = set()
    gene_pathway_ambiguous_edges: Set[Tuple[str, str]] = set()
    pathway_names: Dict[str, str] = {}

    with open(REACTOME_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 6 and parts[5] == "Homo sapiens":
                g, p_id, _, p_name, _, _ = parts[:6]
                if g in all_trusted_genes:
                    gene_pathway_trusted_edges.add((g, p_id))
                    pathway_names[p_id] = p_name
                elif g in all_ambiguous_only_genes:
                    gene_pathway_ambiguous_edges.add((g, p_id))
                    pathway_names[p_id] = p_name

    print(f"  Reactome ingestion complete in {time.time() - t_re_start:.2f}s.")
    print(f"  Target–Pathway Edges:")
    print(f"    - Trusted Gene Edges:   {len(gene_pathway_trusted_edges):,} edges across {len(set(g for g, _ in gene_pathway_trusted_edges)):,} genes and {len(set(p for _, p in gene_pathway_trusted_edges)):,} pathways")
    print(f"    - Ambiguous Gene Edges: {len(gene_pathway_ambiguous_edges):,} edges")

    # -------------------------------------------------------------------------
    # 5. Measure Full Multi-Hop Connectivity & Drug–Target–Disease Paths
    # -------------------------------------------------------------------------
    print("\n[5/5] Measuring multi-hop connectivity and distinct (D -> T -> Di) paths...")

    # Gene to diseases index
    gene_to_trusted_diseases: Dict[str, Set[str]] = {}
    for d, g in disease_target_trusted_edges:
        if g not in gene_to_trusted_diseases:
            gene_to_trusted_diseases[g] = set()
        gene_to_trusted_diseases[g].add(d)

    # A) Trusted Curated Mechanism Paths: (D -> T_trusted -> Di)
    trusted_curated_paths: Set[Tuple[str, str, str]] = set()
    trusted_curated_drug_disease_pairs: Set[Tuple[str, str]] = set()
    connected_curated_drugs: Set[str] = set()
    connected_curated_genes: Set[str] = set()
    connected_curated_diseases: Set[str] = set()

    for d, g in trusted_curated_drug_target_edges:
        if g in gene_to_trusted_diseases:
            for dis in gene_to_trusted_diseases[g]:
                trusted_curated_paths.add((d, g, dis))
                trusted_curated_drug_disease_pairs.add((d, dis))
                connected_curated_drugs.add(d)
                connected_curated_genes.add(g)
                connected_curated_diseases.add(dis)

    # B) Trusted Bioactivity-Derived Paths: (D -> T_bio -> Di)
    trusted_bioactivity_paths: Set[Tuple[str, str, str]] = set()
    trusted_bioactivity_drug_disease_pairs: Set[Tuple[str, str]] = set()
    connected_bio_drugs: Set[str] = set()
    connected_bio_genes: Set[str] = set()
    connected_bio_diseases: Set[str] = set()

    for d, g in trusted_bioactivity_drug_target_edges:
        if g in gene_to_trusted_diseases:
            for dis in gene_to_trusted_diseases[g]:
                trusted_bioactivity_paths.add((d, g, dis))
                trusted_bioactivity_drug_disease_pairs.add((d, dis))
                connected_bio_drugs.add(d)
                connected_bio_genes.add(g)
                connected_bio_diseases.add(dis)

    # Combined Trusted Union (Curated + Bioactivity)
    all_trusted_paths = trusted_curated_paths.union(trusted_bioactivity_paths)
    all_trusted_drug_disease_pairs = trusted_curated_drug_disease_pairs.union(trusted_bioactivity_drug_disease_pairs)
    all_connected_trusted_drugs = connected_curated_drugs.union(connected_bio_drugs)
    all_connected_trusted_genes = connected_curated_genes.union(connected_bio_genes)
    all_connected_trusted_diseases = connected_curated_diseases.union(connected_bio_diseases)

    # Connected Pathways
    connected_pathways = set(p for g, p in gene_pathway_trusted_edges if g in all_connected_trusted_genes)

    # Overlap with Curated Indications
    curated_paths_matching_indications = trusted_curated_drug_disease_pairs.intersection(drug_indication_edges)
    bio_paths_matching_indications = trusted_bioactivity_drug_disease_pairs.intersection(drug_indication_edges)
    novel_repurposing_pairs_curated = trusted_curated_drug_disease_pairs - drug_indication_edges
    novel_repurposing_pairs_total = all_trusted_drug_disease_pairs - drug_indication_edges

    # C) Ambiguous Mappings Analysis (Reported Separately)
    gene_to_ambiguous_diseases: Dict[str, Set[str]] = {}
    for d, g in disease_target_ambiguous_edges:
        if g not in gene_to_ambiguous_diseases:
            gene_to_ambiguous_diseases[g] = set()
        gene_to_ambiguous_diseases[g].add(d)

    ambiguous_paths: Set[Tuple[str, str, str]] = set()
    ambiguous_drug_disease_pairs: Set[Tuple[str, str]] = set()

    all_ambiguous_drug_target_edges = ambiguous_curated_drug_target_edges.union(ambiguous_bioactivity_drug_target_edges)
    for d, g in all_ambiguous_drug_target_edges:
        target_dis_set = gene_to_trusted_diseases.get(g, set()).union(gene_to_ambiguous_diseases.get(g, set()))
        for dis in target_dis_set:
            ambiguous_paths.add((d, g, dis))
            ambiguous_drug_disease_pairs.add((d, dis))

    elapsed_total = time.time() - start_time

    audit_report = {
        "auditVersion": "v6-phase2-connectivity-audit-v1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "elapsedSeconds": round(elapsed_total, 2),
        "sourceArtifacts": {
            "chemblDatabase": str(DB_PATH),
            "targetCrosswalk": str(CROSSWALK_PATH),
            "openTargetsDirectory": str(OPEN_TARGETS_DIR),
            "reactomePathwayFile": str(REACTOME_PATH),
        },
        "connectedNodeCounts": {
            "drugs": {
                "totalClinicalApprovedEligible": len(drugs_dict),
                "withCuratedMechanism": len(drugs_with_curated_mechanism),
                "withBioactivity": len(drugs_with_bioactivity),
                "connectedThroughCuratedMechanisms": len(connected_curated_drugs),
                "connectedThroughBioactivity": len(connected_bio_drugs),
                "totalConnectedTrustedDrugs": len(all_connected_trusted_drugs),
                "v5BaselineComparison": 2,  # Only 2 drugs in V5!
                "connectivityExpansionFactorVsV5": round(len(all_connected_trusted_drugs) / 2, 1),
            },
            "genes": {
                "totalInCrosswalk": len(all_trusted_genes),
                "connectedThroughCuratedMechanisms": len(connected_curated_genes),
                "connectedThroughBioactivity": len(connected_bio_genes),
                "totalConnectedTrustedGenes": len(all_connected_trusted_genes),
            },
            "diseases": {
                "totalOpenTargetsDiseases": len(disease_metadata),
                "connectedThroughCuratedMechanisms": len(connected_curated_diseases),
                "connectedThroughBioactivity": len(connected_bio_diseases),
                "totalConnectedTrustedDiseases": len(all_connected_trusted_diseases),
            },
            "pathways": {
                "totalHumanPathways": len(pathway_names),
                "connectedToTrustedGenes": len(connected_pathways),
            },
        },
        "relationCountsByType": {
            "drugTargetCuratedMechanismTrusted": len(trusted_curated_drug_target_edges),
            "drugTargetBioactivityTrusted": len(trusted_bioactivity_drug_target_edges),
            "totalDrugTargetTrusted": len(trusted_curated_drug_target_edges) + len(trusted_bioactivity_drug_target_edges),
            "diseaseTargetTrustedAll": len(disease_target_trusted_edges),
            "diseaseTargetTrustedScoreGte01": len(disease_target_trusted_confident_edges),
            "targetPathwayTrusted": len(gene_pathway_trusted_edges),
            "drugIndicationCurated": len(drug_indication_edges),
        },
        "drugTargetDiseasePaths": {
            "curatedMechanisms": {
                "distinctPaths_D_T_Di": len(trusted_curated_paths),
                "distinctDrugDiseasePairs_D_Di": len(trusted_curated_drug_disease_pairs),
                "pairsMatchingCuratedIndications": len(curated_paths_matching_indications),
                "novelRepurposingCandidatePairs": len(novel_repurposing_pairs_curated),
            },
            "bioactivityDerived": {
                "distinctPaths_D_T_Di": len(trusted_bioactivity_paths),
                "distinctDrugDiseasePairs_D_Di": len(trusted_bioactivity_drug_disease_pairs),
                "pairsMatchingCuratedIndications": len(bio_paths_matching_indications),
            },
            "combinedTrustedTotal": {
                "distinctPaths_D_T_Di": len(all_trusted_paths),
                "distinctDrugDiseasePairs_D_Di": len(all_trusted_drug_disease_pairs),
                "novelRepurposingCandidatePairs": len(novel_repurposing_pairs_total),
            },
        },
        "ambiguousMappingsSeparateReport": {
            "ambiguousTargetCount": len(ambiguous_target_to_genes),
            "ambiguousOnlyGenes": len(all_ambiguous_only_genes),
            "ambiguousCuratedEdges": len(ambiguous_curated_drug_target_edges),
            "ambiguousBioactivityEdges": len(ambiguous_bioactivity_drug_target_edges),
            "ambiguousDiseaseTargetEdges": len(disease_target_ambiguous_edges),
            "ambiguousDistinctPaths_D_T_Di": len(ambiguous_paths),
            "ambiguousDrugDiseasePairs_D_Di": len(ambiguous_drug_disease_pairs),
        },
    }

    AUDIT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(audit_report, f, indent=2)

    print(f"\n[Audit] Report successfully saved to: {AUDIT_OUTPUT_PATH}")
    return audit_report


if __name__ == "__main__":
    rep = run_connectivity_audit()
    print("\n==================== V6 Phase 2 Connectivity Summary ====================")
    c_nodes = rep["connectedNodeCounts"]
    c_rel = rep["relationCountsByType"]
    c_paths = rep["drugTargetDiseasePaths"]
    amb = rep["ambiguousMappingsSeparateReport"]

    print(f"Connected Drugs (Trusted):             {c_nodes['drugs']['totalConnectedTrustedDrugs']:,} (vs 2 in V5 -> {c_nodes['drugs']['connectivityExpansionFactorVsV5']}x expansion)")
    print(f"  - via Curated Mechanisms:            {c_nodes['drugs']['connectedThroughCuratedMechanisms']:,}")
    print(f"  - via Bioactivities (<= 1 uM):       {c_nodes['drugs']['connectedThroughBioactivity']:,}")
    print(f"Connected Genes/Targets:               {c_nodes['genes']['totalConnectedTrustedGenes']:,}")
    print(f"Connected Diseases:                    {c_nodes['diseases']['totalConnectedTrustedDiseases']:,}")
    print(f"Connected Human Pathways:              {c_nodes['pathways']['connectedToTrustedGenes']:,}")
    print(f"\nRelation Counts (Trusted):")
    print(f"  DRUG -> TARGET (Curated):            {c_rel['drugTargetCuratedMechanismTrusted']:,}")
    print(f"  DRUG -> TARGET (Bioactivity):        {c_rel['drugTargetBioactivityTrusted']:,}")
    print(f"  DISEASE -> TARGET (Open Targets):    {c_rel['diseaseTargetTrustedAll']:,} ({c_rel['diseaseTargetTrustedScoreGte01']:,} score >= 0.1)")
    print(f"  TARGET -> PATHWAY (Reactome 97):     {c_rel['targetPathwayTrusted']:,}")
    print(f"  DRUG -> INDICATION (Ground Truth):   {c_rel['drugIndicationCurated']:,}")
    print(f"\nDistinct Drug-Target-Disease Paths:")
    print(f"  Curated Mechanisms Paths (D->T->Di): {c_paths['curatedMechanisms']['distinctPaths_D_T_Di']:,}")
    print(f"  Curated Drug-Disease Pairs:          {c_paths['curatedMechanisms']['distinctDrugDiseasePairs_D_Di']:,} ({c_paths['curatedMechanisms']['novelRepurposingCandidatePairs']:,} novel candidate pairs)")
    print(f"  Total Trusted Paths (Curated + Bio): {c_paths['combinedTrustedTotal']['distinctPaths_D_T_Di']:,}")
    print(f"  Total Trusted Drug-Disease Pairs:    {c_paths['combinedTrustedTotal']['distinctDrugDiseasePairs_D_Di']:,} ({c_paths['combinedTrustedTotal']['novelRepurposingCandidatePairs']:,} novel candidate pairs)")
    print(f"\nAmbiguous Mappings (Reported Separately):")
    print(f"  Ambiguous Targets:                   {amb['ambiguousTargetCount']}")
    print(f"  Ambiguous Drug-Target Edges:         {amb['ambiguousCuratedEdges'] + amb['ambiguousBioactivityEdges']:,}")
    print(f"  Ambiguous Paths (D->T->Di):          {amb['ambiguousDistinctPaths_D_T_Di']:,}")
    print("=========================================================================\n")
