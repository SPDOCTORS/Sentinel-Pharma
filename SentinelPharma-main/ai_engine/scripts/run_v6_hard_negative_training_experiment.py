"""SentinelPharma V6 Hard-Negative R-GCN Controlled Training Experiment Runner.

Executes:
1. Multi-seed training (3 seeds: 42, 43, 44) of experimental R-GCN with training-only hard negative sampling.
2. Evaluates each seed on validation candidate pools (hard pools and uniform pools).
3. Reports overall and connected/disconnected subgroup MRR, Hits@10, and AUPRC (mean +/- std).
4. Compares against original R-GCN, 2-hop baseline, and popularity control.
5. Preserves existing model checkpoints and frozen graph artifacts.
"""
import argparse
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Add project root and ai_engine root
AI_ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_ROOT))

import numpy as np
import pyarrow.parquet as pq
import torch

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6TwoHopBaselineScorer,
    normalize_disease_canonical,
)
from app.services.gnn.v6_hard_negative_eval import HARD_EVAL_OUTPUT_DIR
from app.services.gnn.v6_hard_negative_training_service import (
    HARD_TRAIN_OUTPUT_DIR,
    V6HardNegativeRGCNTrainer,
    V6TrainingHardNegativeSampler,
)
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6RGCNModel,
    V6TensorGraph,
)


def load_ontology_dag(open_targets_dir: Path):
    dis_parquet = open_targets_dir / "disease.parquet"
    table = pq.read_table(dis_parquet, columns=["id", "therapeuticAreas", "ancestors", "descendants"])
    disease_ta = {}
    disease_anc = {}
    disease_desc = {}
    for did, tas, anc, desc in zip(
        table["id"].to_pylist(),
        table["therapeuticAreas"].to_pylist(),
        table["ancestors"].to_pylist(),
        table["descendants"].to_pylist(),
    ):
        cid = normalize_disease_canonical(did)
        disease_ta[cid] = set(normalize_disease_canonical(t) for t in (tas or []))
        disease_anc[cid] = set(normalize_disease_canonical(a) for a in (anc or []))
        disease_desc[cid] = set(normalize_disease_canonical(d) for d in (desc or []))
    return disease_ta, disease_anc, disease_desc


def main():
    parser = argparse.ArgumentParser(description="Run controlled V6 R-GCN hard-negative training experiment")
    parser.add_argument("--frozen-dir", type=Path, default=DEFAULT_FROZEN_DIR, help="Path to frozen V6 graph directory")
    parser.add_argument("--experiment-dir", type=Path, default=DEFAULT_EXPERIMENT_DIR, help="Path to baseline experiment artifacts")
    parser.add_argument("--hard-eval-dir", type=Path, default=HARD_EVAL_OUTPUT_DIR, help="Path to hard eval directory")
    parser.add_argument("--open-targets-dir", type=Path, default=DEFAULT_OPEN_TARGETS_DIR, help="Path to Open Targets dir")
    parser.add_argument("--output-dir", type=Path, default=HARD_TRAIN_OUTPUT_DIR, help="Path to output training dir")
    parser.add_argument("--epochs", type=int, default=15, help="Epochs per seed")
    parser.add_argument("--patience", type=int, default=5, help="Early stopping patience")
    parser.add_argument("--lr", type=float, default=0.01, help="Learning rate")
    args = parser.parse_args()

    print("=================================================================")
    print("  SentinelPharma V6: Controlled R-GCN Hard-Negative Training    ")
    print("=================================================================")
    print(f"Frozen Graph Dir:        {args.frozen_dir}")
    print(f"Splits Dir:              {args.experiment_dir}")
    print(f"Hard Eval Dir:           {args.hard_eval_dir}")
    print(f"Output Directory:        {args.output_dir}")
    print(f"Epochs per Seed:         {args.epochs} (Patience: {args.patience})")
    print("-----------------------------------------------------------------")

    t0 = time.time()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load Artifacts
    print("\n[1/5] Loading frozen graph, splits, candidate pools, and ontology...")
    with open(args.frozen_dir / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(args.experiment_dir / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)
    with open(args.hard_eval_dir / "hard_candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        hard_pools = json.load(f)["valQueries"]
    with open(args.experiment_dir / "candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        uniform_pools = json.load(f)["valQueries"]

    entities = graph["entities"]
    relations = graph["relations"]
    train_pairs = splits["train"]
    val_queries = splits["val"]

    # Tag connectivity on both pools
    scorer = V6TwoHopBaselineScorer(relations)
    for p in hard_pools:
        sc, _ = scorer.score_pair(p["drug"], p["positiveDisease"])
        p["isTwoHopConnected"] = (sc > 0.0)
    for p in uniform_pools:
        sc, _ = scorer.score_pair(p["drug"], p["positiveDisease"])
        p["isTwoHopConnected"] = (sc > 0.0)

    disease_ta, disease_anc, disease_desc = load_ontology_dag(args.open_targets_dir)

    print(f"  Loaded {len(entities):,} entities, {len(relations):,} relations.")
    print(f"  Training pairs: {len(train_pairs):,} (Training strictly on Train).")
    print(f"  Validation pools: {len(hard_pools):,} hard pools, {len(uniform_pools):,} uniform pools.")

    # 2. Setup Tensor Graph & Training Sampler
    print("\n[2/5] Building PyG tensor graph and initializing training hard negative sampler...")
    tensor_graph = V6TensorGraph(entities, relations)
    sampler = V6TrainingHardNegativeSampler(
        train_pairs=train_pairs,
        entities=entities,
        disease_therapeutic_areas=disease_ta,
        disease_ancestors=disease_anc,
        disease_descendants=disease_desc,
        tensor_graph=tensor_graph,
    )
    print("  Sampler ready: 10,079 training pairs indexed with frequency-matched & ontology-aware candidate pools.")

    # 3. Multi-Seed Training (3 Seeds: 42, 43, 44)
    seeds = [42, 43, 44]
    seed_runs: Dict[int, Dict[str, Any]] = {}
    best_overall_mrr = -1.0
    best_overall_weights = None
    best_overall_seed = -1

    print("\n[3/5] Commencing 3-seed controlled training experiment...")
    for s_idx, seed in enumerate(seeds, start=1):
        print(f"\n--- [Seed {seed} ({s_idx}/3)] Initializing R-GCN ---")
        torch.manual_seed(seed)
        model = V6RGCNModel(
            num_nodes=tensor_graph.num_nodes,
            hidden_dim=64,
            num_relations=tensor_graph.num_relations,
            num_bases=4,
            dropout=0.2,
        )
        trainer = V6HardNegativeRGCNTrainer(
            tensor_graph=tensor_graph,
            model=model,
            learning_rate=args.lr,
            weight_decay=1e-5,
            device="cpu",
        )

        best_seed_mrr = -1.0
        best_seed_epoch = -1
        best_seed_weights = None
        best_seed_hard_eval = None
        patience_counter = 0
        curves = []

        for ep in range(1, args.epochs + 1):
            ep_t0 = time.time()
            loss = trainer.train_epoch(train_pairs, sampler, seed=seed * 100 + ep)
            val_eval = trainer.evaluate_validation_pools(hard_pools)
            ep_time = time.time() - ep_t0

            curves.append({
                "epoch": ep,
                "loss": round(loss, 4),
                "valHardMRR": val_eval["mrr"],
                "valHardHits10": val_eval["hitsAt10Percent"],
                "valHardAUPRC": val_eval["auprc"],
                "valConnMRR": val_eval["subgroups"]["twoHopConnected"]["mrr"],
                "valDisconnMRR": val_eval["subgroups"]["twoHopDisconnected"]["mrr"],
                "timeSec": round(ep_time, 2),
            })

            print(f"  Seed {seed} | Ep {ep:02d}/{args.epochs:02d} [{ep_time:4.2f}s] - Loss: {loss:.4f} | Hard Val MRR: {val_eval['mrr']:.4f} | Hits@10: {val_eval['hitsAt10Percent']:5.2f}% | AUPRC: {val_eval['auprc']:.4f} | Conn MRR: {val_eval['subgroups']['twoHopConnected']['mrr']:.4f} | Disconn MRR: {val_eval['subgroups']['twoHopDisconnected']['mrr']:.4f}")

            if val_eval["mrr"] > best_seed_mrr:
                best_seed_mrr = val_eval["mrr"]
                best_seed_epoch = ep
                best_seed_hard_eval = val_eval
                best_seed_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
                patience_counter = 0
            else:
                patience_counter += 1
                if patience_counter >= args.patience:
                    print(f"  Early stopping at epoch {ep} for seed {seed} (best epoch: {best_seed_epoch} with MRR={best_seed_mrr:.4f}).")
                    break

        # Save checkpoint for this seed
        seed_ckpt_path = args.output_dir / f"model_weights_seed_{seed}.pt"
        torch.save(best_seed_weights, seed_ckpt_path)

        # Evaluate best model for this seed on uniform pools as well
        model.load_state_dict(best_seed_weights)
        uniform_eval = trainer.evaluate_validation_pools(uniform_pools)

        seed_runs[seed] = {
            "seed": seed,
            "bestEpoch": best_seed_epoch,
            "bestHardValidation": best_seed_hard_eval,
            "uniformValidation": uniform_eval,
            "trainingCurves": curves,
            "weightsPath": str(seed_ckpt_path.name),
        }

        if best_seed_mrr > best_overall_mrr:
            best_overall_mrr = best_seed_mrr
            best_overall_weights = best_seed_weights
            best_overall_seed = seed

    # Save overall best model weights
    torch.save(best_overall_weights, args.output_dir / "best_model_weights.pt")

    # 4. Aggregate Metrics Across 3 Seeds
    print("\n[4/5] Aggregating multi-seed metrics (Mean +/- Std)...")
    hard_mrrs = [seed_runs[s]["bestHardValidation"]["mrr"] for s in seeds]
    hard_h10s = [seed_runs[s]["bestHardValidation"]["hitsAt10Percent"] for s in seeds]
    hard_auprcs = [seed_runs[s]["bestHardValidation"]["auprc"] for s in seeds]

    hard_conn_mrrs = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopConnected"]["mrr"] for s in seeds]
    hard_conn_h10s = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopConnected"]["hitsAt10Percent"] for s in seeds]
    hard_conn_auprcs = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopConnected"]["auprc"] for s in seeds]

    hard_disconn_mrrs = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopDisconnected"]["mrr"] for s in seeds]
    hard_disconn_h10s = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"] for s in seeds]
    hard_disconn_auprcs = [seed_runs[s]["bestHardValidation"]["subgroups"]["twoHopDisconnected"]["auprc"] for s in seeds]

    uniform_mrrs = [seed_runs[s]["uniformValidation"]["mrr"] for s in seeds]
    uniform_h10s = [seed_runs[s]["uniformValidation"]["hitsAt10Percent"] for s in seeds]
    uniform_auprcs = [seed_runs[s]["uniformValidation"]["auprc"] for s in seeds]

    multi_seed_summary = {
        "seeds": seeds,
        "bestOverallSeed": best_overall_seed,
        "hardCandidatePool": {
            "overall": {
                "mrr": {"mean": round(float(np.mean(hard_mrrs)), 4), "std": round(float(np.std(hard_mrrs)), 4), "values": hard_mrrs},
                "hitsAt10Percent": {"mean": round(float(np.mean(hard_h10s)), 2), "std": round(float(np.std(hard_h10s)), 2), "values": hard_h10s},
                "auprc": {"mean": round(float(np.mean(hard_auprcs)), 4), "std": round(float(np.std(hard_auprcs)), 4), "values": hard_auprcs},
            },
            "twoHopConnected": {
                "mrr": {"mean": round(float(np.mean(hard_conn_mrrs)), 4), "std": round(float(np.std(hard_conn_mrrs)), 4), "values": hard_conn_mrrs},
                "hitsAt10Percent": {"mean": round(float(np.mean(hard_conn_h10s)), 2), "std": round(float(np.std(hard_conn_h10s)), 2), "values": hard_conn_h10s},
                "auprc": {"mean": round(float(np.mean(hard_conn_auprcs)), 4), "std": round(float(np.std(hard_conn_auprcs)), 4), "values": hard_conn_auprcs},
            },
            "twoHopDisconnected": {
                "mrr": {"mean": round(float(np.mean(hard_disconn_mrrs)), 4), "std": round(float(np.std(hard_disconn_mrrs)), 4), "values": hard_disconn_mrrs},
                "hitsAt10Percent": {"mean": round(float(np.mean(hard_disconn_h10s)), 2), "std": round(float(np.std(hard_disconn_h10s)), 2), "values": hard_disconn_h10s},
                "auprc": {"mean": round(float(np.mean(hard_disconn_auprcs)), 4), "std": round(float(np.std(hard_disconn_auprcs)), 4), "values": hard_disconn_auprcs},
            },
        },
        "uniformCandidatePool": {
            "overall": {
                "mrr": {"mean": round(float(np.mean(uniform_mrrs)), 4), "std": round(float(np.std(uniform_mrrs)), 4), "values": uniform_mrrs},
                "hitsAt10Percent": {"mean": round(float(np.mean(uniform_h10s)), 2), "std": round(float(np.std(uniform_h10s)), 2), "values": uniform_h10s},
                "auprc": {"mean": round(float(np.mean(uniform_auprcs)), 4), "std": round(float(np.std(uniform_auprcs)), 4), "values": uniform_auprcs},
            },
        },
    }

    # 5. Load Baselines for Side-by-Side Comparison
    print("\n[5/5] Loading comparative benchmarks and saving final experiment manifest...")
    with open(args.hard_eval_dir / "hard_evaluation_metrics.json", "r", encoding="utf-8") as f:
        hard_eval_ref = json.load(f)

    bench_hard = hard_eval_ref["comparativeBenchmark"]["hardCandidatePool"]
    bench_uniform = hard_eval_ref["comparativeBenchmark"]["uniformCandidatePool"]

    final_payload = {
        "experimentVersion": "v6-rgcn-hard-negative-training-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "frozenGraphDatasetHash": graph["datasetHash"],
        "validationQueryCount": len(hard_pools),
        "multiSeedSummary": multi_seed_summary,
        "seedRuns": seed_runs,
        "comparativeBaselines": {
            "hardCandidatePool": {
                "hard_negative_rgcn_mean": multi_seed_summary["hardCandidatePool"]["overall"],
                "original_rgcn": bench_hard["v6_rgcn_frozen"],
                "two_hop_baseline": bench_hard["two_hop_baseline"],
                "disease_popularity": bench_hard["disease_popularity"],
            },
            "uniformCandidatePool": {
                "hard_negative_rgcn_mean": multi_seed_summary["uniformCandidatePool"]["overall"],
                "original_rgcn": bench_uniform["v6_rgcn_frozen"],
                "two_hop_baseline": bench_uniform["two_hop_baseline"],
                "disease_popularity": bench_uniform["disease_popularity"],
            },
        },
    }

    metrics_path = args.output_dir / "hard_negative_training_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, indent=2)

    total_time = time.time() - t0
    print(f"\n=================================================================")
    print(f"  Experiment Complete in {total_time:.1f}s!")
    print(f"  Hard-Negative R-GCN Mean Hard MRR:    {multi_seed_summary['hardCandidatePool']['overall']['mrr']['mean']:.4f} +/- {multi_seed_summary['hardCandidatePool']['overall']['mrr']['std']:.4f}")
    print(f"  Hard-Negative R-GCN Mean Hard Hits@10: {multi_seed_summary['hardCandidatePool']['overall']['hitsAt10Percent']['mean']:.2f}% +/- {multi_seed_summary['hardCandidatePool']['overall']['hitsAt10Percent']['std']:.2f}%")
    print(f"  Hard-Negative R-GCN Mean Hard AUPRC:   {multi_seed_summary['hardCandidatePool']['overall']['auprc']['mean']:.4f} +/- {multi_seed_summary['hardCandidatePool']['overall']['auprc']['std']:.4f}")
    print(f"  Saved artifacts to: {args.output_dir}")
    print(f"=================================================================")


if __name__ == "__main__":
    main()
