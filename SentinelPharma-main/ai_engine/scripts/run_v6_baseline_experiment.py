"""SentinelPharma V6 Baseline Experiment Runner.

Executes:
1. Deterministic ontology-grouped train/val/test splitting.
2. Verification of zero leakage (pairwise and hierarchical).
3. Candidate ranking pool generation (1 positive + 99 unlabelled negatives).
4. 2-hop shared-target ranking baseline evaluation.
5. Metrics calculation: Coverage, AUPRC, AUROC, MRR, Hits@1, Hits@5, Hits@10, Hits@20.
6. Frozen artifact preservation and serialization.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# Add project root and ai_engine root
AI_ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_ROOT))

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6BaselineEvaluator,
    V6CandidatePoolGenerator,
    V6OntologyClusterSplitter,
    V6TwoHopBaselineScorer,
)


def main():
    parser = argparse.ArgumentParser(description="Run SentinelPharma V6 GNN Baseline Experimentation")
    parser.add_argument("--frozen-dir", type=Path, default=DEFAULT_FROZEN_DIR, help="Path to frozen V6 graph directory")
    parser.add_argument("--open-targets-dir", type=Path, default=DEFAULT_OPEN_TARGETS_DIR, help="Path to Open Targets 26.06 directory")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_EXPERIMENT_DIR, help="Output directory for experiment artifacts")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic splitting and sampling")
    parser.add_argument("--candidates-per-query", type=int, default=100, help="Candidate pool size (1 positive + N-1 negatives)")
    args = parser.parse_args()

    print("=================================================================")
    print("      SentinelPharma V6: GNN Experimentation & Baseline          ")
    print("=================================================================")
    print(f"Frozen Graph Dir:        {args.frozen_dir}")
    print(f"Open Targets Dir:        {args.open_targets_dir}")
    print(f"Output Experiment Dir:   {args.output_dir}")
    print(f"Random Seed:             {args.seed}")
    print(f"Candidate Pool Size:     {args.candidates_per_query} (1 pos + {args.candidates_per_query - 1} negatives)")
    print("-----------------------------------------------------------------")

    t0 = time.time()

    # 1. Load Frozen Artifacts
    print("\n[1/5] Loading frozen biomedical graph and supervision indications...")
    graph_path = args.frozen_dir / "graph.json"
    supervision_path = args.frozen_dir / "supervision_indications.json"

    with open(graph_path, "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(supervision_path, "r", encoding="utf-8") as f:
        supervision = json.load(f)

    entities = graph["entities"]
    relations = graph["relations"]
    indications = supervision["indications"]

    all_diseases = [e["canonicalId"] for e in entities if e["entityType"] == "DISEASE"]
    print(f"  Loaded {len(entities):,} entities ({len(all_diseases):,} diseases), {len(relations):,} relations.")
    print(f"  Loaded {len(indications):,} curated supervision indication pairs.")

    # 2. Create Deterministic Ontology-Grouped Splits
    print("\n[2/5] Creating deterministic ontology-grouped train/val/test splits...")
    splitter = V6OntologyClusterSplitter(open_targets_dir=args.open_targets_dir)
    split_result = splitter.create_splits(
        indications=indications,
        train_ratio=0.80,
        val_ratio=0.10,
        test_ratio=0.10,
        seed=args.seed,
    )

    leakage = split_result["leakageCheck"]
    print(f"  Total Ontology Clusters:   {split_result['totalClusters']:,}")
    print(f"  Cluster Partition:         Train={split_result['clusterCounts']['train']:,}, Val={split_result['clusterCounts']['val']:,}, Test={split_result['clusterCounts']['test']:,}")
    print(f"  Indication Pairs:          Train={split_result['pairCounts']['train']:,} ({split_result['pairCounts']['train']/len(indications)*100:.2f}%), "
          f"Val={split_result['pairCounts']['val']:,} ({split_result['pairCounts']['val']/len(indications)*100:.2f}%), "
          f"Test={split_result['pairCounts']['test']:,} ({split_result['pairCounts']['test']/len(indications)*100:.2f}%)")
    print(f"  Pairwise Overlap:          {leakage['pairwiseOverlap']} pairs (clean)")
    print(f"  Ontology Hierarchy Leak:   {leakage['ontologyHierarchyLeakage']} pairs (zero leakage guaranteed)")
    assert leakage["isLeakageFree"], "CRITICAL: Split leakage detected!"

    # 3. Generate Fixed Candidate Ranking Pools
    print(f"\n[3/5] Generating fixed candidate pools (1 pos + {args.candidates_per_query - 1} negatives)...")
    pool_gen = V6CandidatePoolGenerator(
        all_diseases=all_diseases,
        all_indications=indications,
        disease_ancestors=splitter.disease_ancestors,
        disease_descendants=splitter.disease_descendants,
        negatives_per_query=args.candidates_per_query - 1,
        seed=args.seed,
    )

    test_pools = pool_gen.generate_pools(split_result["splits"]["test"])
    val_pools = pool_gen.generate_pools(split_result["splits"]["val"])
    print(f"  Generated {len(test_pools):,} test candidate pools and {len(val_pools):,} validation candidate pools.")
    print("  Negative Sampling Policy:")
    print("    - Uniform unlabelled sampling from 2,605 V6 diseases.")
    print("    - False-negative filtering: Known drug indications across all splits excluded.")
    print("    - Ontology-consistency filtering: Parent/ancestor/descendant diseases excluded.")

    # 4. Implement & Evaluate 2-Hop Shared-Target Baseline
    print("\n[4/5] Evaluating 2-hop shared-target ranking baseline on test set...")
    scorer = V6TwoHopBaselineScorer(relations=relations)
    evaluator = V6BaselineEvaluator(scorer=scorer)

    eval_results = evaluator.evaluate_ranking_pools(test_pools)

    # 5. Persist Experiment Artifacts
    print(f"\n[5/5] Persisting experimentation artifacts to {args.output_dir}...")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    split_manifest = {
        "experimentVersion": "v6-gnn-baseline-experiment-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "frozenGraphDatasetHash": graph["datasetHash"],
        "seed": args.seed,
        "splitConfig": {
            "ratios": split_result["ratios"],
            "totalClusters": split_result["totalClusters"],
            "clusterCounts": split_result["clusterCounts"],
            "pairCounts": split_result["pairCounts"],
            "leakageControls": [
                "Grouping ontology-equivalent indications for each drug into atomic clusters prior to partitioning.",
                "Complete message-passing graph invariance: Indication edges are not present in graph.json relations.",
                "False-negative and ontology-filtered negative candidate generation.",
            ],
            "leakageCheck": split_result["leakageCheck"],
        },
        "negativeSamplingConfig": {
            "candidatePoolSize": args.candidates_per_query,
            "negativesPerQuery": args.candidates_per_query - 1,
            "samplingStrategy": "uniform_unlabelled_with_ontology_and_indication_filtering",
            "eligibleDiseasePoolSize": len(all_diseases),
            "seed": args.seed,
        },
    }

    manifest_file = args.output_dir / "split_manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(split_manifest, f, indent=2)

    splits_file = args.output_dir / "splits.json"
    with open(splits_file, "w", encoding="utf-8") as f:
        json.dump({
            "train": split_result["splits"]["train"],
            "val": split_result["splits"]["val"],
            "test": split_result["splits"]["test"],
        }, f, indent=2)

    pools_file = args.output_dir / "candidate_ranking_pool.json"
    with open(pools_file, "w", encoding="utf-8") as f:
        json.dump({
            "testQueries": test_pools,
            "valQueries": val_pools,
        }, f, indent=2)

    metrics_file = args.output_dir / "baseline_metrics.json"
    baseline_payload = {
        "baselineName": "two_hop_shared_target_affinity_weighted",
        "description": "2-hop direct shared target overlap (Drug -> Target -> Disease) weighted by Open Targets score and ChEMBL affinity",
        "frozenGraphDatasetHash": graph["datasetHash"],
        "metrics": eval_results,
    }
    with open(metrics_file, "w", encoding="utf-8") as f:
        json.dump(baseline_payload, f, indent=2)

    total_time = time.time() - t0

    # Print Summary Report
    rk = eval_results["rankingMetrics"]
    cl = eval_results["classificationMetrics"]
    sg = eval_results["subgroupAnalysis"]

    print("\n=================================================================")
    print("          SentinelPharma V6: 2-Hop Baseline Results              ")
    print("=================================================================")
    print(f"Test Evaluation Queries:     {eval_results['queryCount']:,}")
    print(f"Candidate Pool Size:         {eval_results['candidatePoolSize']} candidates per query")
    print(f"2-Hop Structural Coverage:   {eval_results['coveragePercent']}% (queries with score > 0)")
    print("-----------------------------------------------------------------")
    print("Ranking Performance (100 Candidates Ranking Protocol):")
    print(f"  - MRR (Mean Reciprocal Rank):  {rk['mrr']:.4f}")
    print(f"  - Hits@1:                      {rk['hitsAt1Percent']:.2f}%")
    print(f"  - Hits@5:                      {rk['hitsAt5Percent']:.2f}%")
    print(f"  - Hits@10:                     {rk['hitsAt10Percent']:.2f}%")
    print(f"  - Hits@20:                     {rk['hitsAt20Percent']:.2f}%")
    print("-----------------------------------------------------------------")
    print("Binary Classification Performance (1:99 Negative Imbalance):")
    print(f"  - AUPRC:                       {cl['auprc']:.4f}")
    print(f"  - AUROC:                       {cl['auroc']:.4f}")
    print("-----------------------------------------------------------------")
    print("Subgroup Breakdown:")
    print(f"  - 2-Hop Connected Pairs:       {sg['twoHopConnected']['count']:,} ({sg['twoHopConnected']['percent']}%) | MRR: {sg['twoHopConnected']['mrr']:.4f} | Hits@10: {sg['twoHopConnected']['hitsAt10Percent']:.2f}%")
    print(f"  - 2-Hop Disconnected Pairs:    {sg['twoHopDisconnected']['count']:,} ({sg['twoHopDisconnected']['percent']}%) | MRR: {sg['twoHopDisconnected']['mrr']:.4f} | Hits@10: {sg['twoHopDisconnected']['hitsAt10Percent']:.2f}%")
    print("-----------------------------------------------------------------")
    print("Clinical Phase Stratification:")
    for phase_name, stats in eval_results["phaseStratification"].items():
        print(f"  - {phase_name:<15}: {stats['count']:>4} queries | Coverage: {stats['coveragePercent']:>5.1f}% | MRR: {stats['mrr']:.4f} | Hits@10: {stats['hitsAt10Percent']:>5.1f}%")
    print("-----------------------------------------------------------------")
    print("Saved Experiment Artifacts:")
    for f in [manifest_file, splits_file, pools_file, metrics_file]:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  - {f.name:<30} ({size_mb:>5.2f} MB) -> {f}")
    print(f"Experiment completed in {total_time:.2f}s.")
    print("=================================================================")


if __name__ == "__main__":
    main()
