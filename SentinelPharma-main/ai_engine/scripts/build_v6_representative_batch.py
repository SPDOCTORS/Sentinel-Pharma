"""SentinelPharma V6 Phase 1: Build and save the representative batch target crosswalk.

Extracts and resolves 17 representative ChEMBL targets covering:
1. Exact 1-to-1 single human proteins (e.g. CHEMBL206/ESR1, CHEMBL227/AGTR1, CHEMBL234/NR3C2)
2. Multi-protein complexes and families (e.g. CHEMBL2094253/PTGS1+PTGS2, CHEMBL1907589, CHEMBL2093872)
3. Partial resolution multi-protein complexes (e.g. CHEMBL2111348 with O75343 unmapped)
4. Ambiguous 1-to-many gene loci mappings (e.g. CHEMBL238/Q01959, CHEMBL2363070/P28702)
5. Non-human organism targets (e.g. CHEMBL2311224, CHEMBL2354204, CHEMBL2363076, CHEMBL2364670)

Saves artifacts to:
- artifacts/target_crosswalks/v6_phase1_batch/target_crosswalk.json
- artifacts/target_crosswalks/v6_phase1_batch/coverage_statistics.json
"""
import json
import sys
from pathlib import Path

# Add ai_engine to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.gnn.v6_crosswalk_builder import V6TargetCrosswalkBuilder

REPRESENTATIVE_TARGET_BATCH = [
    # 1. Exact 1-to-1 human single proteins
    "CHEMBL206",     # Estrogen receptor (ESR1)
    "CHEMBL227",     # Angiotensin II type 1 receptor (AGTR1)
    "CHEMBL234",     # Dopamine D3 receptor (DRD3)
    "CHEMBL222",     # Sodium/glucose cotransporter 2 (SLC5A2)
    "CHEMBL1871",    # Androgen receptor (AR)
    "CHEMBL1876",    # Solute carrier family 12 member 1 (SLC12A1)
    "CHEMBL235",     # Peroxisome proliferator-activated receptor gamma (PPARG)
    # 2. Multi-protein complexes and families
    "CHEMBL2094253", # Cyclooxygenase-1 and -2 family (PTGS1, PTGS2)
    "CHEMBL1907589", # GABA-A receptor alpha-1/beta-2 complex
    "CHEMBL2093872", # GABA receptor subtype complex group (15 subunits)
    # 3. Multi-protein complex with partial resolution (one unmapped subunit)
    "CHEMBL2111348", # NMDA receptor subunit complex group (Q02153, P33402, Q02108 + unmapped O75343)
    # 4. Ambiguous 1-to-many gene loci
    "CHEMBL238",     # Potassium voltage-gated channel subfamily H member 2 (KCNH2 / Q01959 -> 2 genes)
    "CHEMBL2363070", # Carbonic anhydrase family (P28702 -> 6 genes, + P48443, P19793)
    # 5. Non-human bacterial targets (rejected cleanly)
    "CHEMBL2311224", # Bacterial beta-lactamase complex (Bacteria)
    "CHEMBL2354204", # Bacterial penicillin-binding protein (Bacteria)
    "CHEMBL2363076", # Bacterial DNA gyrase complex (Bacteria)
    "CHEMBL2364670", # Bacterial beta-lactamase (Bacteria)
]


def run():
    print("[V6 Phase 1] Initializing V6TargetCrosswalkBuilder...")
    artifacts_dir = Path(__file__).resolve().parents[1] / "artifacts"
    builder = V6TargetCrosswalkBuilder(artifacts_dir=artifacts_dir)
    builder.index_sources()

    print(f"[V6 Phase 1] Resolving representative batch of {len(REPRESENTATIVE_TARGET_BATCH)} targets...")
    snapshot = builder.build_crosswalk(target_ids=REPRESENTATIVE_TARGET_BATCH)

    output_dir = artifacts_dir / "target_crosswalks" / "v6_phase1_batch"
    cw_file, stats_file = builder.save_snapshot(snapshot, output_dir)

    stats = snapshot["coverageStatistics"]
    print("\n========== V6 Phase 1 Coverage Report ==========")
    print(f"Total targets:           {stats['totalTargets']}")
    print(f"Human targets:           {stats['humanTargets']}")
    print(f"Non-human targets:       {stats['nonHumanTargets']}")
    print(f"Single-protein targets:  {stats['singleProteinTargets']}")
    print(f"Multi-protein targets:   {stats['multiProteinTargets']}")
    print(f"Target resolution:       {stats['targetResolution']['resolved']} resolved, "
          f"{stats['targetResolution']['partiallyResolved']} partially resolved, "
          f"{stats['targetResolution']['unresolved']} unresolved")
    print(f"Human resolution rate:   {stats['targetResolution']['humanResolutionRatePct']}%")
    print(f"Total components:        {stats['componentMappings']['totalComponents']}")
    print(f"  Exact (1:1):           {stats['componentMappings']['exact']}")
    print(f"  One-to-many:           {stats['componentMappings']['oneToMany']}")
    print(f"  Unresolved:            {stats['componentMappings']['unresolved']}")
    print(f"    - Non-human:         {stats['unresolvedBreakdown']['nonHuman']}")
    print(f"    - No Ensembl:        {stats['unresolvedBreakdown']['noEnsemblMapping']}")
    print(f"Reviewed Swiss-Prot:     {stats['curationStatus']['reviewedSwissProt']} "
          f"({stats['curationStatus']['reviewedRatePct']}%)")
    print(f"Unique Ensembl genes:    {stats['uniqueEnsemblGenes']}")
    print(f"Crosswalk artifact:      {cw_file}")
    print(f"Statistics report:       {stats_file}")
    print("================================================\n")


if __name__ == "__main__":
    run()
