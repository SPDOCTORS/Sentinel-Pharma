"""SentinelPharma V6 Biomedical Knowledge Graph Construction Script.

Builds and freezes the V6 graph artifact using:
- ChEMBL 36 SQLite
- V6 Target Crosswalk
- Open Targets 26.06 (score >= 0.3, >= 3 distinct trusted genes per disease)
- Reactome 97 Pathways
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
AI_ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_ROOT))

from app.services.gnn.v6_biomedical_graph import (
    DEFAULT_CROSSWALK_PATH,
    DEFAULT_DB_PATH,
    DEFAULT_OPEN_TARGETS_DIR,
    DEFAULT_OUTPUT_BASE,
    DEFAULT_REACTOME_PATH,
    V6BiomedicalGraphBuilder,
)


def main():
    parser = argparse.ArgumentParser(description="Construct and freeze SentinelPharma V6 Biomedical Graph")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH, help="Path to ChEMBL 36 SQLite db")
    parser.add_argument("--crosswalk-path", type=Path, default=DEFAULT_CROSSWALK_PATH, help="Path to target crosswalk JSON")
    parser.add_argument("--open-targets-dir", type=Path, default=DEFAULT_OPEN_TARGETS_DIR, help="Path to Open Targets 26.06 dir")
    parser.add_argument("--reactome-path", type=Path, default=DEFAULT_REACTOME_PATH, help="Path to Reactome pathway file")
    parser.add_argument("--min-score", type=float, default=0.3, help="Open Targets direct score threshold")
    parser.add_argument("--min-genes", type=int, default=3, help="Minimum distinct trusted genes per disease")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_BASE / "biomedical_graph_v6_frozen",
        help="Target output directory for frozen V6 artifacts",
    )
    args = parser.parse_args()

    print("=================================================================")
    print("       SentinelPharma V6: Biomedical Graph Construction          ")
    print("=================================================================")
    print(f"ChEMBL SQLite DB:      {args.db_path}")
    print(f"Target Crosswalk:      {args.crosswalk_path}")
    print(f"Open Targets 26.06:    {args.open_targets_dir}")
    print(f"Reactome 97:           {args.reactome_path}")
    print(f"Open Targets Filter:   score >= {args.min_score}, >= {args.min_genes} genes/disease")
    print(f"Output Directory:      {args.output_dir}")
    print("-----------------------------------------------------------------")

    builder = V6BiomedicalGraphBuilder(
        db_path=args.db_path,
        crosswalk_path=args.crosswalk_path,
        open_targets_dir=args.open_targets_dir,
        reactome_path=args.reactome_path,
        min_ot_score=args.min_score,
        min_ot_genes=args.min_genes,
    )

    t0 = time.time()
    graph_payload = builder.build_graph()
    t_build = time.time() - t0

    print(f"\n[Artifact Serialization] Writing frozen artifacts to {args.output_dir}...")
    t_save_start = time.time()
    graph_file, quality_file, supervision_file, ambiguous_file, manifest_file = builder.save_artifacts(
        graph_payload, output_dir=args.output_dir
    )
    t_save = time.time() - t_save_start

    qr = graph_payload["qualityReport"]
    print("\n=================================================================")
    print("                 V6 Graph Build Quality Census                   ")
    print("=================================================================")
    print(f"Dataset Version:            {graph_payload['datasetVersion']}")
    print(f"Dataset Content Hash:       {graph_payload['datasetHash']}")
    print(f"Build Duration:             {t_build:.2f}s (build) + {t_save:.2f}s (save)")
    print("-----------------------------------------------------------------")
    print(f"Total Entities (Nodes):     {qr['totalEntities']:,}")
    for ent_type, cnt in sorted(qr["entitiesByType"].items()):
        print(f"  - {ent_type:<20}: {cnt:>8,}")
    print("-----------------------------------------------------------------")
    print(f"Total Relations (Edges):    {qr['totalRelations']:,}")
    for rel_type, cnt in sorted(qr["relationsByType"].items()):
        print(f"  - {rel_type:<30}: {cnt:>8,}")
    print("-----------------------------------------------------------------")
    print(f"Isolated Entities (deg = 0): {qr['isolatedEntitiesCount']:,}")
    print(f"Node Degree Range:          min={qr['degree']['min']}, max={qr['degree']['max']}, mean={qr['degree']['mean']}")
    print(f"Supervision Indications:    {qr['supervisionIndications']['pairsWithBothEndpointsInV6Graph']:,} pairs (isolated)")
    print(f"Ambiguous Targets Excluded: {graph_payload['ambiguousMappings']['ambiguousTargetCount']:,}")
    print("-----------------------------------------------------------------")
    print("Generated Artifacts:")
    for f in [graph_file, quality_file, supervision_file, ambiguous_file, manifest_file]:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  - {f.name:<30} ({size_mb:>6.2f} MB) -> {f}")
    print("=================================================================")


if __name__ == "__main__":
    main()
