"""SentinelPharma V6 Hybrid Ranking Experiment Runner.

Executes:
1. Leakage-free 5-fold out-of-fold feature generation on training data only.
2. Feature standardization fitted strictly on training data.
3. Fits regularized logistic rankers for Full Hybrid and all feature ablations.
4. Evaluates on validation hard candidate pools across 3 R-GCN seeds (42, 43, 44).
5. Reports subgroup metrics (2-hop connected vs disconnected) and 3-seed variability (mean +/- std).
6. Persists artifacts to artifacts/gnn_experiments/v6_hybrid_ranking/.
"""
import argparse
import json
import os
import random
import sys
import time
from collections import Counter
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
from app.services.gnn.v6_hard_negative_training_service import HARD_TRAIN_OUTPUT_DIR
from app.services.gnn.v6_hybrid_ranking_service import (
    HYBRID_OUTPUT_DIR,
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
    evaluate_hybrid_ranker_on_pools,
    generate_out_of_fold_training_data,
)
from app.services.gnn.v6_rgcn_service import (
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
    parser = argparse.ArgumentParser(description="Run SentinelPharma V6 hybrid ranking experiment")
    parser.add_argument("--frozen-dir", type=Path, default=DEFAULT_FROZEN_DIR, help="Path to frozen V6 graph directory")
    parser.add_argument("--experiment-dir", type=Path, default=DEFAULT_EXPERIMENT_DIR, help="Path to baseline experiment artifacts")
    parser.add_argument("--hard-eval-dir", type=Path, default=HARD_EVAL_OUTPUT_DIR, help="Path to hard eval directory")
    parser.add_argument("--hard-train-dir", type=Path, default=HARD_TRAIN_OUTPUT_DIR, help="Path to hard train directory")
    parser.add_argument("--open-targets-dir", type=Path, default=DEFAULT_OPEN_TARGETS_DIR, help="Path to Open Targets dir")
    parser.add_argument("--output-dir", type=Path, default=HYBRID_OUTPUT_DIR, help="Path to output hybrid dir")
    parser.add_argument("--l2-penalty", type=float, default=0.05, help="L2 regularization penalty")
    args = parser.parse_args()

    print("=================================================================")
    print("      SentinelPharma V6: Hybrid Ranking Validation Experiment    ")
    print("=================================================================")
    print(f"Frozen Graph Dir:        {args.frozen_dir}")
    print(f"Experiment Splits Dir:   {args.experiment_dir}")
    print(f"Hard Eval Pools Dir:     {args.hard_eval_dir}")
    print(f"Hard Trained R-GCN Dir:  {args.hard_train_dir}")
    print(f"Output Directory:        {args.output_dir}")
    print(f"L2 Regularization:       lambda={args.l2_penalty}")
    print("-----------------------------------------------------------------")

    t0 = time.time()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load Artifacts
    print("\n[1/6] Loading frozen graph, splits, hard candidate pools, and ontology...")
    with open(args.frozen_dir / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(args.experiment_dir / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)
    with open(args.hard_eval_dir / "hard_candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        hard_pools = json.load(f)["valQueries"]

    entities = graph["entities"]
    relations = graph["relations"]
    train_pairs = splits["train"]

    two_hop_scorer = V6TwoHopBaselineScorer(relations)
    train_counts = Counter(p["disease"] for p in train_pairs)
    tensor_graph = V6TensorGraph(entities, relations)

    for p in hard_pools:
        sc, _ = two_hop_scorer.score_pair(p["drug"], p["positiveDisease"])
        p["isTwoHopConnected"] = (sc > 0.0)

    disease_ta, disease_anc, disease_desc = load_ontology_dag(args.open_targets_dir)

    print(f"  Loaded {len(entities):,} entities and {len(relations):,} relations.")
    print(f"  Train Pairs: {len(train_pairs):,} (Combiner fitted strictly on Train OOF).")
    print(f"  Validation Queries: {len(hard_pools):,} hard pools (Strictly for evaluation).")

    # 2. Out-Of-Fold Training Data Generation
    print("\n[2/6] Generating out-of-fold training features using 5-fold cross-validation...")
    oof_t0 = time.time()
    X_train_oof, y_train_oof = generate_out_of_fold_training_data(
        train_pairs=train_pairs,
        entities=entities,
        relations=relations,
        disease_therapeutic_areas=disease_ta,
        disease_ancestors=disease_anc,
        disease_descendants=disease_desc,
        n_folds=5,
        seed=42,
    )
    oof_time = time.time() - oof_t0
    print(f"  Generated {len(X_train_oof):,} OOF training samples in {oof_time:.1f}s.")
    print(f"  Features: [2-hop (col 0), popularity (col 1), hard R-GCN (col 2)].")

    # 3. Fit Feature Standardizer on Training Data
    print("\n[3/6] Fitting feature standardizer on training OOF features...")
    scaler = TrainingFeatureScaler()
    scaler.fit(X_train_oof)
    X_train_norm = scaler.transform(X_train_oof)

    print(f"  Training Feature Means: {scaler.mean}")
    print(f"  Training Feature Stds:  {scaler.std}")

    # 4. Train Combiner and Feature Ablation Models
    print("\n[4/6] Fitting regularized logistic combiner and feature ablation models...")
    models_config = {
        "full_hybrid": {"features": [0, 1, 2], "names": ["2hop", "popularity", "rgcn"]},
        "ablation_no_popularity": {"features": [0, 2], "names": ["2hop", "rgcn"]},
        "ablation_no_rgcn": {"features": [0, 1], "names": ["2hop", "popularity"]},
        "ablation_no_two_hop": {"features": [1, 2], "names": ["popularity", "rgcn"]},
        "single_two_hop": {"features": [0], "names": ["2hop"]},
        "single_popularity": {"features": [1], "names": ["popularity"]},
        "single_rgcn": {"features": [2], "names": ["rgcn"]},
    }

    fitted_rankers: Dict[str, RegularizedLogisticRanker] = {}
    weights_summary: Dict[str, Any] = {}

    for m_key, m_cfg in models_config.items():
        feat_sub = m_cfg["features"]
        X_sub = X_train_norm[:, feat_sub]
        ranker = RegularizedLogisticRanker(num_features=len(feat_sub), l2_penalty=args.l2_penalty)
        ranker.fit(X_sub, y_train_oof, seed=42)
        fitted_rankers[m_key] = ranker
        w_dict = ranker.get_weights()
        weights_summary[m_key] = {
            "feature_names": m_cfg["names"],
            "weights": w_dict["weights"],
            "bias": w_dict["bias"],
        }
        print(f"  Model '{m_key}': Weights = {w_dict['weights']}, Bias = {w_dict['bias']:.4f}")

    # 5. Load 3 Hard R-GCN Checkpoints & Evaluate on Validation Hard Pools
    print("\n[5/6] Evaluating on validation hard candidate pools across 3 R-GCN seeds (42, 43, 44)...")
    seeds = [42, 43, 44]
    rgcn_models: Dict[int, V6RGCNModel] = {}
    rgcn_embeddings: Dict[int, torch.Tensor] = {}

    for seed in seeds:
        ckpt_path = args.hard_train_dir / f"model_weights_seed_{seed}.pt"
        m = V6RGCNModel(tensor_graph.num_nodes, 64, tensor_graph.num_relations, 4, 0.2)
        m.load_state_dict(torch.load(ckpt_path, map_location="cpu"))
        m.eval()
        rgcn_models[seed] = m
        with torch.no_grad():
            rgcn_embeddings[seed] = m.encode(tensor_graph.edge_index, tensor_graph.edge_type)

    def make_feature_extractor(seed: int):
        m = rgcn_models[seed]
        h = rgcn_embeddings[seed]

        def extractor(drug: str, candidates: List[str]) -> np.ndarray:
            feats = np.zeros((len(candidates), 3), dtype=np.float32)
            # Feature 0: 2-Hop
            feats[:, 0] = [two_hop_scorer.score_pair(drug, c)[0] for c in candidates]
            # Feature 1: Popularity
            feats[:, 1] = [float(train_counts.get(c, 0)) for c in candidates]
            # Feature 2: Hard R-GCN
            src_idx = tensor_graph.node_to_idx[drug]
            dst_idx = [tensor_graph.node_to_idx[c] for c in candidates]
            src_t = torch.full((len(dst_idx),), src_idx, dtype=torch.long)
            dst_t = torch.tensor(dst_idx, dtype=torch.long)
            with torch.no_grad():
                logits = m.decode(h, src_t, dst_t)
                feats[:, 2] = torch.sigmoid(logits).cpu().numpy()
            return feats

        return extractor

    # Evaluate Full Hybrid across 3 seeds
    seed_hybrid_results: Dict[int, Dict[str, Any]] = {}
    for seed in seeds:
        feat_fn = make_feature_extractor(seed)
        res = evaluate_hybrid_ranker_on_pools(
            pools=hard_pools,
            feature_extractor_fn=feat_fn,
            scaler=scaler,
            ranker=fitted_rankers["full_hybrid"],
            feature_indices=[0, 1, 2],
        )
        seed_hybrid_results[seed] = res
        print(f"  Full Hybrid (Seed {seed}) | Hard MRR: {res['mrr']:.4f} | Hits@10: {res['hitsAt10Percent']:5.2f}% | AUPRC: {res['auprc']:.4f} | Conn MRR: {res['subgroups']['twoHopConnected']['mrr']:.4f} | Disconn MRR: {res['subgroups']['twoHopDisconnected']['mrr']:.4f}")

    # Aggregate 3-seed variability
    seed_mrrs = [seed_hybrid_results[s]["mrr"] for s in seeds]
    seed_h10s = [seed_hybrid_results[s]["hitsAt10Percent"] for s in seeds]
    seed_auprcs = [seed_hybrid_results[s]["auprc"] for s in seeds]

    seed_conn_mrrs = [seed_hybrid_results[s]["subgroups"]["twoHopConnected"]["mrr"] for s in seeds]
    seed_conn_h10s = [seed_hybrid_results[s]["subgroups"]["twoHopConnected"]["hitsAt10Percent"] for s in seeds]
    seed_conn_auprcs = [seed_hybrid_results[s]["subgroups"]["twoHopConnected"]["auprc"] for s in seeds]

    seed_disconn_mrrs = [seed_hybrid_results[s]["subgroups"]["twoHopDisconnected"]["mrr"] for s in seeds]
    seed_disconn_h10s = [seed_hybrid_results[s]["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"] for s in seeds]
    seed_disconn_auprcs = [seed_hybrid_results[s]["subgroups"]["twoHopDisconnected"]["auprc"] for s in seeds]

    hybrid_multi_seed = {
        "overall": {
            "mrr": {"mean": round(float(np.mean(seed_mrrs)), 4), "std": round(float(np.std(seed_mrrs)), 4), "values": seed_mrrs},
            "hitsAt10Percent": {"mean": round(float(np.mean(seed_h10s)), 2), "std": round(float(np.std(seed_h10s)), 2), "values": seed_h10s},
            "auprc": {"mean": round(float(np.mean(seed_auprcs)), 4), "std": round(float(np.std(seed_auprcs)), 4), "values": seed_auprcs},
        },
        "twoHopConnected": {
            "mrr": {"mean": round(float(np.mean(seed_conn_mrrs)), 4), "std": round(float(np.std(seed_conn_mrrs)), 4), "values": seed_conn_mrrs},
            "hitsAt10Percent": {"mean": round(float(np.mean(seed_conn_h10s)), 2), "std": round(float(np.std(seed_conn_h10s)), 2), "values": seed_conn_h10s},
            "auprc": {"mean": round(float(np.mean(seed_conn_auprcs)), 4), "std": round(float(np.std(seed_conn_auprcs)), 4), "values": seed_conn_auprcs},
        },
        "twoHopDisconnected": {
            "mrr": {"mean": round(float(np.mean(seed_disconn_mrrs)), 4), "std": round(float(np.std(seed_disconn_mrrs)), 4), "values": seed_disconn_mrrs},
            "hitsAt10Percent": {"mean": round(float(np.mean(seed_disconn_h10s)), 2), "std": round(float(np.std(seed_disconn_h10s)), 2), "values": seed_disconn_h10s},
            "auprc": {"mean": round(float(np.mean(seed_disconn_auprcs)), 4), "std": round(float(np.std(seed_disconn_auprcs)), 4), "values": seed_disconn_auprcs},
        },
    }

    # Evaluate Feature Ablations using Best Seed (Seed 42)
    print("\n  Evaluating Feature Ablations (Reference Seed 42)...")
    best_feat_fn = make_feature_extractor(seed=42)
    ablation_results: Dict[str, Any] = {}

    for m_key, m_cfg in models_config.items():
        res = evaluate_hybrid_ranker_on_pools(
            pools=hard_pools,
            feature_extractor_fn=best_feat_fn,
            scaler=scaler,
            ranker=fitted_rankers[m_key],
            feature_indices=m_cfg["features"],
        )
        ablation_results[m_key] = res
        print(f"  {m_key:25s} | MRR: {res['mrr']:.4f} | Hits@10: {res['hitsAt10Percent']:5.2f}% | AUPRC: {res['auprc']:.4f} | Conn MRR: {res['subgroups']['twoHopConnected']['mrr']:.4f} | Disconn MRR: {res['subgroups']['twoHopDisconnected']['mrr']:.4f}")

    # 6. Save Artifacts and Summary Report
    print("\n[6/6] Persisting hybrid experiment artifacts...")
    payload = {
        "experimentVersion": "v6-hybrid-logistic-ranking-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "frozenGraphDatasetHash": graph["datasetHash"],
        "validationQueryCount": len(hard_pools),
        "featureScaler": scaler.to_dict(),
        "combinerWeights": weights_summary,
        "threeSeedVariability": hybrid_multi_seed,
        "seedRuns": seed_hybrid_results,
        "featureAblations": ablation_results,
    }

    metrics_path = args.output_dir / "hybrid_ranking_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    total_time = time.time() - t0
    print(f"\n=================================================================")
    print(f"  Hybrid Experiment Complete in {total_time:.1f}s!")
    print(f"  Full Hybrid 3-Seed Mean Hard MRR:     {hybrid_multi_seed['overall']['mrr']['mean']:.4f} +/- {hybrid_multi_seed['overall']['mrr']['std']:.4f}")
    print(f"  Full Hybrid 3-Seed Mean Hard Hits@10:  {hybrid_multi_seed['overall']['hitsAt10Percent']['mean']:.2f}% +/- {hybrid_multi_seed['overall']['hitsAt10Percent']['std']:.2f}%")
    print(f"  Full Hybrid 3-Seed Mean Hard AUPRC:    {hybrid_multi_seed['overall']['auprc']['mean']:.4f} +/- {hybrid_multi_seed['overall']['auprc']['std']:.4f}")
    print(f"  Saved artifacts to: {args.output_dir}")
    print(f"=================================================================")


if __name__ == "__main__":
    main()
