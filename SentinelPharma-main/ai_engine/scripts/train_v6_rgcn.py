"""SentinelPharma V6 Experimental R-GCN Training Script.

Executes:
1. Bioactivity units audit pre-flight verification.
2. Tensor graph construction for 12,985 entities and 8 directed relation types.
3. Training on training labels only (10,079 pairs) with early stopping on validation MRR.
4. Validation performance evaluation on fixed 100-candidate ranking pools (1,283 queries).
5. Subgroup comparison against frozen 2-hop baseline (connected vs disconnected).
6. Artifact persistence: weights, config, bioactivity audit, curves, and validation metrics.
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

import torch

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    V6BaselineEvaluator,
    V6TwoHopBaselineScorer,
)
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6RGCNModel,
    V6RGCNTrainer,
    V6TensorGraph,
    audit_bioactivity_units,
)


def main():
    parser = argparse.ArgumentParser(description="Train SentinelPharma V6 Experimental R-GCN")
    parser.add_argument("--frozen-dir", type=Path, default=DEFAULT_FROZEN_DIR, help="Path to frozen V6 graph directory")
    parser.add_argument("--experiment-dir", type=Path, default=DEFAULT_EXPERIMENT_DIR, help="Path to baseline experiment artifacts")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_RGCN_DIR, help="Output directory for R-GCN artifacts")
    parser.add_argument("--hidden-dim", type=int, default=64, help="Embedding and hidden dimension")
    parser.add_argument("--num-bases", type=int, default=4, help="Number of basis matrices for R-GCN relations")
    parser.add_argument("--epochs", type=int, default=20, help="Maximum training epochs")
    parser.add_argument("--lr", type=float, default=0.01, help="Learning rate")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--patience", type=int, default=8, help="Early stopping patience")
    args = parser.parse_args()

    print("=================================================================")
    print("       SentinelPharma V6: Experimental R-GCN Training            ")
    print("=================================================================")
    print(f"Frozen Graph Dir:        {args.frozen_dir}")
    print(f"Experiment Splits Dir:   {args.experiment_dir}")
    print(f"Output R-GCN Dir:        {args.output_dir}")
    print(f"Hyperparameters:         hidden_dim={args.hidden_dim}, num_bases={args.num_bases}, lr={args.lr}, epochs={args.epochs}")
    print(f"Random Seed:             {args.seed}")
    print("-----------------------------------------------------------------")

    # Set seeds for strict reproducibility
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    t0 = time.time()

    # 1. Load Frozen Artifacts
    print("\n[1/6] Loading frozen graph, splits, and candidate ranking pools...")
    with open(args.frozen_dir / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(args.experiment_dir / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)
    with open(args.experiment_dir / "candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        pools_data = json.load(f)

    entities = graph["entities"]
    relations = graph["relations"]
    train_pairs = splits["train"]
    val_pools = pools_data["valQueries"]

    print(f"  Loaded {len(entities):,} entities and {len(relations):,} relations.")
    print(f"  Train Indications: {len(train_pairs):,} pairs (Training strictly on Train).")
    print(f"  Val Queries:       {len(val_pools):,} candidate pools (Early stopping on Val).")
    print("  Test Set Status:   STRICTLY HELD OUT (0 test evaluation performed).")

    # 2. Pre-flight Bioactivity Units Audit
    print("\n[2/6] Auditing bioactivity units across graph relations...")
    bio_audit = audit_bioactivity_units(relations)
    print(f"  Total Bioactivity Edges: {bio_audit['totalBioactivityEdges']:,}")
    print(f"  Standard Units:          {bio_audit['standardUnits']}")
    print(f"  Potency Cutoff:          {bio_audit['potencyThreshold']}")
    print(f"  Potency Distribution:    median={bio_audit['distributionSummary']['median_nM']} nM, max={bio_audit['distributionSummary']['max_nM']} nM")
    print(f"  All <= 1 uM Verified:    {bio_audit['allValuesWithinOneMicromolar']}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    with open(args.output_dir / "bioactivity_audit.json", "w", encoding="utf-8") as f:
        json.dump(bio_audit, f, indent=2)

    # 3. Compute Frozen 2-Hop Baseline Validation Reference
    print("\n[3/6] Computing frozen 2-hop baseline validation benchmark reference...")
    scorer = V6TwoHopBaselineScorer(relations)
    baseline_evaluator = V6BaselineEvaluator(scorer)
    val_baseline_metrics = baseline_evaluator.evaluate_ranking_pools(val_pools)

    print(f"  Baseline Val MRR:         {val_baseline_metrics['rankingMetrics']['mrr']:.4f}")
    print(f"  Baseline Val Hits@10:     {val_baseline_metrics['rankingMetrics']['hitsAt10Percent']:.2f}%")
    print(f"  Baseline Val AUPRC:       {val_baseline_metrics['classificationMetrics']['auprc']:.4f}")
    print(f"  Baseline Connected MRR:   {val_baseline_metrics['subgroupAnalysis']['twoHopConnected']['mrr']:.4f}")
    print(f"  Baseline Disconnected MRR:{val_baseline_metrics['subgroupAnalysis']['twoHopDisconnected']['mrr']:.4f}")

    # Tag validation pools with 2-hop connectivity flag
    for pool in val_pools:
        sc, _ = scorer.score_pair(pool["drug"], pool["positiveDisease"])
        pool["isTwoHopConnected"] = (sc > 0.0)

    # 4. Construct Tensor Graph and Initialize R-GCN
    print("\n[4/6] Constructing PyG tensor graph and initializing R-GCN model...")
    tensor_graph = V6TensorGraph(entities, relations)
    print(f"  Tensor Graph Nodes:       {tensor_graph.num_nodes:,}")
    print(f"  Tensor Graph Edges:       {tensor_graph.edge_index.shape[1]:,} directed edges across {tensor_graph.num_relations} relation types.")

    all_disease_indices = [tensor_graph.node_to_idx[e["canonicalId"]] for e in entities if e["entityType"] == "DISEASE"]

    model = V6RGCNModel(
        num_nodes=tensor_graph.num_nodes,
        hidden_dim=args.hidden_dim,
        num_relations=tensor_graph.num_relations,
        num_bases=args.num_bases,
        dropout=0.2,
    )
    trainer = V6RGCNTrainer(
        tensor_graph=tensor_graph,
        model=model,
        learning_rate=args.lr,
        weight_decay=1e-5,
        device="cpu",
    )

    # 5. Training Loop with Validation Early Stopping
    print(f"\n[5/6] Training R-GCN for up to {args.epochs} epochs with early stopping (patience={args.patience})...")
    training_curves: List[Dict[str, Any]] = []
    best_val_mrr = -1.0
    best_epoch = -1
    best_weights = None
    best_val_metrics = None
    patience_counter = 0

    for epoch in range(1, args.epochs + 1):
        t_ep_start = time.time()
        loss = trainer.train_epoch(train_pairs, all_disease_indices, seed=args.seed + epoch)

        # Validate
        val_eval = trainer.evaluate_validation_pools(val_pools)
        ep_duration = time.time() - t_ep_start

        epoch_record = {
            "epoch": epoch,
            "trainLoss": round(loss, 4),
            "valMRR": val_eval["mrr"],
            "valHitsAt10": val_eval["hitsAt10Percent"],
            "valAUPRC": val_eval["auprc"],
            "valAUROC": val_eval["auroc"],
            "valConnectedMRR": val_eval["subgroups"]["twoHopConnected"]["mrr"],
            "valDisconnectedMRR": val_eval["subgroups"]["twoHopDisconnected"]["mrr"],
            "durationSec": round(ep_duration, 2),
        }
        training_curves.append(epoch_record)

        print(f"  Epoch {epoch:02d}/{args.epochs:02d} [{ep_duration:4.2f}s] - Loss: {loss:.4f} | Val MRR: {val_eval['mrr']:.4f} | Hits@10: {val_eval['hitsAt10Percent']:5.2f}% | AUPRC: {val_eval['auprc']:.4f} | Conn MRR: {val_eval['subgroups']['twoHopConnected']['mrr']:.4f} | Disconn MRR: {val_eval['subgroups']['twoHopDisconnected']['mrr']:.4f}")

        if val_eval["mrr"] > best_val_mrr:
            best_val_mrr = val_eval["mrr"]
            best_epoch = epoch
            best_val_metrics = val_eval
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"  Early stopping triggered at epoch {epoch} (best epoch: {best_epoch} with MRR={best_val_mrr:.4f}).")
                break

    # 6. Save Model Artifacts and Comparative Report
    print(f"\n[6/6] Persisting best model weights and validation metrics to {args.output_dir}...")
    torch.save(best_weights, args.output_dir / "model_weights.pt")

    config_payload = {
        "modelType": "RGCN_link_prediction",
        "datasetVersion": graph["datasetVersion"],
        "datasetHash": graph["datasetHash"],
        "seed": args.seed,
        "numNodes": tensor_graph.num_nodes,
        "numRelations": tensor_graph.num_relations,
        "numBases": args.num_bases,
        "hiddenDim": args.hidden_dim,
        "learningRate": args.lr,
        "maxEpochs": args.epochs,
        "actualEpochs": len(training_curves),
        "bestEpoch": best_epoch,
        "earlyStoppingMetric": "val_mrr",
        "patience": args.patience,
    }
    with open(args.output_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(config_payload, f, indent=2)

    with open(args.output_dir / "training_curves.json", "w", encoding="utf-8") as f:
        json.dump({
            "bestEpoch": best_epoch,
            "bestValMRR": best_val_mrr,
            "epochs": training_curves,
        }, f, indent=2)

    # Comparative report: R-GCN vs 2-Hop Baseline
    val_comparison = {
        "bestEpoch": best_epoch,
        "modelEvaluation": best_val_metrics,
        "baselineEvaluation": val_baseline_metrics,
        "deltaComparison": {
            "overall": {
                "mrr_delta": round(best_val_metrics["mrr"] - val_baseline_metrics["rankingMetrics"]["mrr"], 4),
                "hitsAt10_delta": round(best_val_metrics["hitsAt10Percent"] - val_baseline_metrics["rankingMetrics"]["hitsAt10Percent"], 2),
                "auprc_delta": round(best_val_metrics["auprc"] - val_baseline_metrics["classificationMetrics"]["auprc"], 4),
            },
            "subgroupConnected": {
                "rgcn_mrr": best_val_metrics["subgroups"]["twoHopConnected"]["mrr"],
                "baseline_mrr": val_baseline_metrics["subgroupAnalysis"]["twoHopConnected"]["mrr"],
                "mrr_delta": round(best_val_metrics["subgroups"]["twoHopConnected"]["mrr"] - val_baseline_metrics["subgroupAnalysis"]["twoHopConnected"]["mrr"], 4),
            },
            "subgroupDisconnected": {
                "rgcn_mrr": best_val_metrics["subgroups"]["twoHopDisconnected"]["mrr"],
                "baseline_mrr": val_baseline_metrics["subgroupAnalysis"]["twoHopDisconnected"]["mrr"],
                "mrr_delta": round(best_val_metrics["subgroups"]["twoHopDisconnected"]["mrr"] - val_baseline_metrics["subgroupAnalysis"]["twoHopDisconnected"]["mrr"], 4),
                "rgcn_hitsAt10": best_val_metrics["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"],
                "baseline_hitsAt10": val_baseline_metrics["subgroupAnalysis"]["twoHopDisconnected"]["hitsAt10Percent"],
                "hitsAt10_delta": round(best_val_metrics["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"] - val_baseline_metrics["subgroupAnalysis"]["twoHopDisconnected"]["hitsAt10Percent"], 2),
            },
        },
    }
    with open(args.output_dir / "validation_metrics.json", "w", encoding="utf-8") as f:
        json.dump(val_comparison, f, indent=2)

    total_time = time.time() - t0

    # Summary Display
    print("\n=================================================================")
    print("      SentinelPharma V6: R-GCN Validation Comparison             ")
    print("=================================================================")
    print(f"Validation Queries:          {best_val_metrics['queryCount']:,} (100 candidate diseases/query)")
    print(f"Best Validation Epoch:       Epoch {best_epoch} (patience={args.patience})")
    print("-----------------------------------------------------------------")
    print(f"{'Metric':<25} | {'2-Hop Baseline':<16} | {'V6 R-GCN':<16} | {'Delta':<10}")
    print("-----------------------------------------------------------------")
    print(f"{'Overall MRR':<25} | {val_baseline_metrics['rankingMetrics']['mrr']:<16.4f} | {best_val_metrics['mrr']:<16.4f} | {val_comparison['deltaComparison']['overall']['mrr_delta']:+0.4f}")
    print(f"{'Overall Hits@10 (%)':<25} | {val_baseline_metrics['rankingMetrics']['hitsAt10Percent']:<16.2f} | {best_val_metrics['hitsAt10Percent']:<16.2f} | {val_comparison['deltaComparison']['overall']['hitsAt10_delta']:+0.2f}%")
    print(f"{'Overall AUPRC':<25} | {val_baseline_metrics['classificationMetrics']['auprc']:<16.4f} | {best_val_metrics['auprc']:<16.4f} | {val_comparison['deltaComparison']['overall']['auprc_delta']:+0.4f}")
    print("-----------------------------------------------------------------")
    print("Subgroup: 2-Hop Connected (715 queries, 55.7%):")
    print(f"{'  Connected MRR':<25} | {val_baseline_metrics['subgroupAnalysis']['twoHopConnected']['mrr']:<16.4f} | {best_val_metrics['subgroups']['twoHopConnected']['mrr']:<16.4f} | {val_comparison['deltaComparison']['subgroupConnected']['mrr_delta']:+0.4f}")
    print("-----------------------------------------------------------------")
    print("Subgroup: 2-Hop Disconnected (568 queries, 44.3% - requires multi-hop cascade):")
    print(f"{'  Disconnected MRR':<25} | {val_baseline_metrics['subgroupAnalysis']['twoHopDisconnected']['mrr']:<16.4f} | {best_val_metrics['subgroups']['twoHopDisconnected']['mrr']:<16.4f} | {val_comparison['deltaComparison']['subgroupDisconnected']['mrr_delta']:+0.4f}")
    print(f"{'  Disconnected Hits@10':<25} | {val_baseline_metrics['subgroupAnalysis']['twoHopDisconnected']['hitsAt10Percent']:<16.2f}% | {best_val_metrics['subgroups']['twoHopDisconnected']['hitsAt10Percent']:<16.2f}% | {val_comparison['deltaComparison']['subgroupDisconnected']['hitsAt10_delta']:+0.2f}%")
    print("-----------------------------------------------------------------")
    print("Saved Experiment Artifacts:")
    for f_name in ["model_weights.pt", "config.json", "bioactivity_audit.json", "training_curves.json", "validation_metrics.json"]:
        f_path = args.output_dir / f_name
        size_mb = f_path.stat().st_size / (1024 * 1024)
        print(f"  - {f_name:<25} ({size_mb:>5.2f} MB) -> {f_path}")
    print(f"Training completed in {total_time:.2f}s.")
    print("=================================================================")


if __name__ == "__main__":
    main()
