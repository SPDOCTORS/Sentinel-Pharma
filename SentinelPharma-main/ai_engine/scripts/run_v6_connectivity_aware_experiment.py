"""SentinelPharma V6 Connectivity-Aware Hybrid Ranking Experiment Runner.

Executes the end-to-end connectivity-aware hybrid ranker experiment:
1. Loads 5-fold OOF training data (cached or re-computed strictly from train splits).
2. Fits TrainingFeatureScaler and L2-regularized logistic ranker (lambda=0.01) on expanded features:
   [s_2, s_pop, s_rgcn, s_2 * s_rgcn]
3. Verifies mathematical continuity (boundary jump check at s_2 -> 0+).
4. Evaluates on 1,283 validation hard candidate pools across 3 R-GCN seeds (42, 43, 44).
5. Computes paired bootstrap confidence intervals (1,000 resamples) for Overall, Connected,
   and Disconnected subgroups against both Static Full Hybrid and 2-Hop + Popularity.
6. Saves comprehensive artifact to:
   ai_engine/artifacts/gnn_experiments/v6_connectivity_aware_hybrid/connectivity_aware_metrics.json
"""
from __future__ import annotations

import datetime
import json
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch

# Ensure package imports work
ai_engine_root = Path(__file__).resolve().parents[1]
if str(ai_engine_root) not in sys.path:
    sys.path.insert(0, str(ai_engine_root))

from app.services.gnn.v6_connectivity_aware_service import (
    CONN_AWARE_OUTPUT_DIR,
    build_connectivity_aware_features,
    evaluate_candidate_pools,
    verify_score_continuity,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6TwoHopBaselineScorer,
    compute_auprc_auroc,
    normalize_disease_canonical,
)
from app.services.gnn.v6_hard_negative_eval import HARD_EVAL_OUTPUT_DIR
from app.services.gnn.v6_hard_negative_training_service import HARD_TRAIN_OUTPUT_DIR
from app.services.gnn.v6_hybrid_audit_service import compute_paired_bootstrap_differences
from app.services.gnn.v6_hybrid_ranking_service import (
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
    generate_out_of_fold_training_data,
)
from app.services.gnn.v6_rgcn_service import V6RGCNModel, V6TensorGraph


def run_experiment() -> Path:
    print("=== SentinelPharma V6 Connectivity-Aware Hybrid Ranking Experiment ===")
    start_time = datetime.datetime.now(datetime.timezone.utc)

    CONN_AWARE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CONN_AWARE_OUTPUT_DIR / "oof_training_features_cache.npz"

    # 1. Load Graph and Splits
    graph_file = DEFAULT_FROZEN_DIR / "graph.json"
    with open(graph_file, "r", encoding="utf-8") as f:
        graph = json.load(f)
    entities = graph["entities"]
    relations = graph["relations"]

    with open(DEFAULT_EXPERIMENT_DIR / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)
    train_pairs = splits["train"]

    with open(HARD_EVAL_OUTPUT_DIR / "hard_candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        hard_pools_data = json.load(f)
    val_pools = hard_pools_data["valQueries"]

    train_disease_counts = Counter(p["disease"] for p in train_pairs)
    two_hop_scorer = V6TwoHopBaselineScorer(relations)
    tensor_graph = V6TensorGraph(entities, relations)

    # 2. Load or Compute Out-Of-Fold Training Data
    if cache_file.exists():
        print(f"Loading cached OOF training data from {cache_file}...")
        cache_data = np.load(cache_file)
        X_oof_raw = cache_data["X_oof"]
        y_oof = cache_data["y_oof"]
    else:
        print("Computing 5-fold OOF training data...")
        dis_parquet = DEFAULT_OPEN_TARGETS_DIR / "disease.parquet"
        table = pq.read_table(dis_parquet, columns=["id", "therapeuticAreas", "ancestors", "descendants"])
        disease_ta, disease_anc, disease_desc = {}, {}, {}
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

        X_oof_raw, y_oof = generate_out_of_fold_training_data(
            train_pairs=train_pairs,
            entities=entities,
            relations=relations,
            disease_therapeutic_areas=disease_ta,
            disease_ancestors=disease_anc,
            disease_descendants=disease_desc,
            n_folds=5,
            seed=42,
        )
        np.savez(cache_file, X_oof=X_oof_raw, y_oof=y_oof)

    print(f"OOF Training set: {X_oof_raw.shape[0]} samples, {X_oof_raw.shape[1]} raw features.")

    # 3. Fit Connectivity-Aware Feature Scaler and Ranker
    X_oof_conn = build_connectivity_aware_features(X_oof_raw)
    scaler = TrainingFeatureScaler()
    scaler.fit(X_oof_conn)
    X_oof_norm = scaler.transform(X_oof_conn)

    conn_ranker = RegularizedLogisticRanker(num_features=4, l2_penalty=0.01, lr=0.05, epochs=250)
    conn_ranker.fit(X_oof_norm, y_oof, seed=42)
    conn_weights = conn_ranker.get_weights()
    print("Connectivity-Aware Combiner Weights:", conn_weights)

    # 4. Verify Mathematical Continuity Across Boundary
    continuity_audit = verify_score_continuity(conn_ranker, scaler, test_rgcn=0.5, test_pop=50.0, epsilon=1e-5)
    print("Score Continuity Audit:", continuity_audit)
    assert continuity_audit["isContinuous"], "Model violates score continuity at connectivity boundary!"

    # 5. Fit Baselines for Paired Comparison (Static Full and 2-Hop + Popularity)
    static_scaler = TrainingFeatureScaler()
    static_scaler.fit(X_oof_raw)
    static_norm = static_scaler.transform(X_oof_raw)
    static_ranker = RegularizedLogisticRanker(num_features=3, l2_penalty=0.05, lr=0.05, epochs=200)
    static_ranker.fit(static_norm, y_oof, seed=42)

    baseline_norm = static_norm[:, [0, 1]]
    baseline_ranker = RegularizedLogisticRanker(num_features=2, l2_penalty=0.05, lr=0.05, epochs=200)
    baseline_ranker.fit(baseline_norm, y_oof, seed=42)

    # 6. Evaluate across 3 R-GCN Seeds
    seed_runs: Dict[str, Any] = {}
    seed_conn_res = []
    seed_stat_res = []
    seed_base_res = []

    for seed in [42, 43, 44]:
        print(f"\n--- Evaluating Seed {seed} ---")
        weights_path = HARD_TRAIN_OUTPUT_DIR / f"model_weights_seed_{seed}.pt"
        rgcn_model = V6RGCNModel(tensor_graph.num_nodes, 64, tensor_graph.num_relations, 4, 0.2)
        rgcn_model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        rgcn_model.eval()

        with torch.no_grad():
            h_rgcn = rgcn_model.encode(tensor_graph.edge_index, tensor_graph.edge_type)

        def extract_raw_features(drug: str, candidates: List[str]) -> np.ndarray:
            feats = np.zeros((len(candidates), 3), dtype=np.float32)
            feats[:, 0] = [two_hop_scorer.score_pair(drug, c)[0] for c in candidates]
            feats[:, 1] = [float(train_disease_counts.get(c, 0)) for c in candidates]
            src_idx = tensor_graph.node_to_idx[drug]
            dst_idx = [tensor_graph.node_to_idx[c] for c in candidates]
            src_t = torch.full((len(dst_idx),), src_idx, dtype=torch.long)
            dst_t = torch.tensor(dst_idx, dtype=torch.long)
            with torch.no_grad():
                feats[:, 2] = torch.sigmoid(rgcn_model.decode(h_rgcn, src_t, dst_t)).cpu().numpy()
            return feats

        # Evaluate Connectivity-Aware Hybrid
        res_conn = evaluate_candidate_pools(val_pools, extract_raw_features, scaler, conn_ranker)
        seed_conn_res.append(res_conn)

        # Evaluate Static Full Hybrid
        def eval_static(pools, feat_extractor):
            rr, h1, h5, h10, sc, yt = [], [], [], [], [], []
            sub_rr = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_h10 = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_sc = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_yt = {"twoHopConnected": [], "twoHopDisconnected": []}
            for p in pools:
                d = p["drug"]
                pos = p["positiveDisease"]
                cands = p["candidatePool"]
                raw = feat_extractor(d, cands)
                norm = static_scaler.transform(raw)
                scores = static_ranker.predict_logits(norm)
                ranked = sorted(zip(cands, scores), key=lambda x: (-x[1], x[0]))
                rank = next(idx for idx, (c, _) in enumerate(ranked, start=1) if c == pos)
                r = 1.0 / rank
                rr.append(r)
                h1.append(1 if rank <= 1 else 0)
                h5.append(1 if rank <= 5 else 0)
                h10.append(1 if rank <= 10 else 0)
                y_tr = [1 if c == pos else 0 for c in cands]
                sc.append(scores.tolist())
                yt.append(y_tr)
                grp = "twoHopConnected" if p.get("isTwoHopConnected", False) else "twoHopDisconnected"
                sub_rr[grp].append(r)
                sub_h10[grp].append(1 if rank <= 10 else 0)
                sub_sc[grp].append(scores.tolist())
                sub_yt[grp].append(y_tr)
            flat_yt = np.array([y for sub in yt for y in sub])
            flat_sc = np.array([s for sub in sc for s in sub])
            auprc, auroc = compute_auprc_auroc(flat_yt, flat_sc)
            c_yt = np.array([y for sub in sub_yt["twoHopConnected"] for y in sub])
            c_sc = np.array([s for sub in sub_sc["twoHopConnected"] for s in sub])
            c_auprc = compute_auprc_auroc(c_yt, c_sc)[0] if len(c_yt) > 0 else 0.0
            d_yt = np.array([y for sub in sub_yt["twoHopDisconnected"] for y in sub])
            d_sc = np.array([s for sub in sub_sc["twoHopDisconnected"] for s in sub])
            d_auprc = compute_auprc_auroc(d_yt, d_sc)[0] if len(d_yt) > 0 else 0.0
            return {
                "mrr": round(float(np.mean(rr)), 4),
                "hitsAt10Percent": round(float(np.mean(h10) * 100), 2),
                "auprc": round(auprc, 4),
                "reciprocalRanks": rr,
                "hitsAt10": h10,
                "poolScores": sc,
                "poolLabels": yt,
                "subgroups": {
                    "twoHopConnected": {
                        "count": len(sub_rr["twoHopConnected"]),
                        "mrr": round(float(np.mean(sub_rr["twoHopConnected"])), 4),
                        "hitsAt10Percent": round(float(np.mean(sub_h10["twoHopConnected"]) * 100), 2),
                        "auprc": round(c_auprc, 4),
                        "reciprocalRanks": sub_rr["twoHopConnected"],
                        "hitsAt10": sub_h10["twoHopConnected"],
                        "poolScores": sub_sc["twoHopConnected"],
                        "poolLabels": sub_yt["twoHopConnected"],
                    },
                    "twoHopDisconnected": {
                        "count": len(sub_rr["twoHopDisconnected"]),
                        "mrr": round(float(np.mean(sub_rr["twoHopDisconnected"])), 4),
                        "hitsAt10Percent": round(float(np.mean(sub_h10["twoHopDisconnected"]) * 100), 2),
                        "auprc": round(d_auprc, 4),
                        "reciprocalRanks": sub_rr["twoHopDisconnected"],
                        "hitsAt10": sub_h10["twoHopDisconnected"],
                        "poolScores": sub_sc["twoHopDisconnected"],
                        "poolLabels": sub_yt["twoHopDisconnected"],
                    },
                },
            }

        # Evaluate 2-Hop + Popularity
        def eval_baseline(pools, feat_extractor):
            rr, h10, sc, yt = [], [], [], []
            sub_rr = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_h10 = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_sc = {"twoHopConnected": [], "twoHopDisconnected": []}
            sub_yt = {"twoHopConnected": [], "twoHopDisconnected": []}
            for p in pools:
                d = p["drug"]
                pos = p["positiveDisease"]
                cands = p["candidatePool"]
                raw = feat_extractor(d, cands)
                norm = static_scaler.transform(raw)[:, [0, 1]]
                scores = baseline_ranker.predict_logits(norm)
                ranked = sorted(zip(cands, scores), key=lambda x: (-x[1], x[0]))
                rank = next(idx for idx, (c, _) in enumerate(ranked, start=1) if c == pos)
                r = 1.0 / rank
                rr.append(r)
                h10.append(1 if rank <= 10 else 0)
                y_tr = [1 if c == pos else 0 for c in cands]
                sc.append(scores.tolist())
                yt.append(y_tr)
                grp = "twoHopConnected" if p.get("isTwoHopConnected", False) else "twoHopDisconnected"
                sub_rr[grp].append(r)
                sub_h10[grp].append(1 if rank <= 10 else 0)
                sub_sc[grp].append(scores.tolist())
                sub_yt[grp].append(y_tr)
            flat_yt = np.array([y for sub in yt for y in sub])
            flat_sc = np.array([s for sub in sc for s in sub])
            auprc, _ = compute_auprc_auroc(flat_yt, flat_sc)
            c_yt = np.array([y for sub in sub_yt["twoHopConnected"] for y in sub])
            c_sc = np.array([s for sub in sub_sc["twoHopConnected"] for s in sub])
            c_auprc = compute_auprc_auroc(c_yt, c_sc)[0] if len(c_yt) > 0 else 0.0
            d_yt = np.array([y for sub in sub_yt["twoHopDisconnected"] for y in sub])
            d_sc = np.array([s for sub in sub_sc["twoHopDisconnected"] for s in sub])
            d_auprc = compute_auprc_auroc(d_yt, d_sc)[0] if len(d_yt) > 0 else 0.0
            return {
                "mrr": round(float(np.mean(rr)), 4),
                "hitsAt10Percent": round(float(np.mean(h10) * 100), 2),
                "auprc": round(auprc, 4),
                "reciprocalRanks": rr,
                "hitsAt10": h10,
                "poolScores": sc,
                "poolLabels": yt,
                "subgroups": {
                    "twoHopConnected": {
                        "count": len(sub_rr["twoHopConnected"]),
                        "mrr": round(float(np.mean(sub_rr["twoHopConnected"])), 4),
                        "hitsAt10Percent": round(float(np.mean(sub_h10["twoHopConnected"]) * 100), 2),
                        "auprc": round(c_auprc, 4),
                        "reciprocalRanks": sub_rr["twoHopConnected"],
                        "hitsAt10": sub_h10["twoHopConnected"],
                        "poolScores": sub_sc["twoHopConnected"],
                        "poolLabels": sub_yt["twoHopConnected"],
                    },
                    "twoHopDisconnected": {
                        "count": len(sub_rr["twoHopDisconnected"]),
                        "mrr": round(float(np.mean(sub_rr["twoHopDisconnected"])), 4),
                        "hitsAt10Percent": round(float(np.mean(sub_h10["twoHopDisconnected"]) * 100), 2),
                        "auprc": round(d_auprc, 4),
                        "reciprocalRanks": sub_rr["twoHopDisconnected"],
                        "hitsAt10": sub_h10["twoHopDisconnected"],
                        "poolScores": sub_sc["twoHopDisconnected"],
                        "poolLabels": sub_yt["twoHopDisconnected"],
                    },
                },
            }

        res_stat = eval_static(val_pools, extract_raw_features)
        seed_stat_res.append(res_stat)

        res_base = eval_baseline(val_pools, extract_raw_features)
        seed_base_res.append(res_base)

        seed_runs[str(seed)] = {
            "queryCount": res_conn["queryCount"],
            "mrr": res_conn["mrr"],
            "hitsAt1Percent": res_conn["hitsAt1Percent"],
            "hitsAt5Percent": res_conn["hitsAt5Percent"],
            "hitsAt10Percent": res_conn["hitsAt10Percent"],
            "auprc": res_conn["auprc"],
            "auroc": res_conn["auroc"],
            "subgroups": {
                "twoHopConnected": {
                    "count": res_conn["subgroups"]["twoHopConnected"]["count"],
                    "mrr": res_conn["subgroups"]["twoHopConnected"]["mrr"],
                    "hitsAt10Percent": res_conn["subgroups"]["twoHopConnected"]["hitsAt10Percent"],
                    "auprc": res_conn["subgroups"]["twoHopConnected"]["auprc"],
                },
                "twoHopDisconnected": {
                    "count": res_conn["subgroups"]["twoHopDisconnected"]["count"],
                    "mrr": res_conn["subgroups"]["twoHopDisconnected"]["mrr"],
                    "hitsAt10Percent": res_conn["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"],
                    "auprc": res_conn["subgroups"]["twoHopDisconnected"]["auprc"],
                },
            },
        }
        print(
            f"Seed {seed} Conn-Aware: MRR={res_conn['mrr']:.4f}, H@10={res_conn['hitsAt10Percent']:.2f}%, AUPRC={res_conn['auprc']:.4f}"
        )
        print(
            f"  Connected ({res_conn['subgroups']['twoHopConnected']['count']}): MRR={res_conn['subgroups']['twoHopConnected']['mrr']:.4f}, H@10={res_conn['subgroups']['twoHopConnected']['hitsAt10Percent']:.2f}%"
        )
        print(
            f"  Disconnected ({res_conn['subgroups']['twoHopDisconnected']['count']}): MRR={res_conn['subgroups']['twoHopDisconnected']['mrr']:.4f}, H@10={res_conn['subgroups']['twoHopDisconnected']['hitsAt10Percent']:.2f}%"
        )

    # 7. Compute 3-Seed Variability
    def compute_variability(key_fn):
        vals = [key_fn(r) for r in seed_conn_res]
        return {"mean": round(float(np.mean(vals)), 4), "std": round(float(np.std(vals)), 4), "values": vals}

    three_seed_var = {
        "overall": {
            "mrr": compute_variability(lambda r: r["mrr"]),
            "hitsAt10Percent": compute_variability(lambda r: r["hitsAt10Percent"]),
            "auprc": compute_variability(lambda r: r["auprc"]),
        },
        "twoHopConnected": {
            "mrr": compute_variability(lambda r: r["subgroups"]["twoHopConnected"]["mrr"]),
            "hitsAt10Percent": compute_variability(lambda r: r["subgroups"]["twoHopConnected"]["hitsAt10Percent"]),
            "auprc": compute_variability(lambda r: r["subgroups"]["twoHopConnected"]["auprc"]),
        },
        "twoHopDisconnected": {
            "mrr": compute_variability(lambda r: r["subgroups"]["twoHopDisconnected"]["mrr"]),
            "hitsAt10Percent": compute_variability(lambda r: r["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"]),
            "auprc": compute_variability(lambda r: r["subgroups"]["twoHopDisconnected"]["auprc"]),
        },
    }

    # 8. Compute Paired Bootstrap Confidence Intervals (Seed 42)
    print("\nComputing Paired Bootstrap Confidence Intervals (1,000 resamples)...")
    r0_conn = seed_conn_res[0]
    r0_stat = seed_stat_res[0]
    r0_base = seed_base_res[0]

    # Overall comparisons
    boot_overall_vs_stat = compute_paired_bootstrap_differences(
        r0_conn["reciprocalRanks"],
        r0_stat["reciprocalRanks"],
        r0_conn["hitsAt10"],
        r0_stat["hitsAt10"],
        r0_conn["poolScores"],
        r0_stat["poolScores"],
        r0_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )
    boot_overall_vs_base = compute_paired_bootstrap_differences(
        r0_conn["reciprocalRanks"],
        r0_base["reciprocalRanks"],
        r0_conn["hitsAt10"],
        r0_base["hitsAt10"],
        r0_conn["poolScores"],
        r0_base["poolScores"],
        r0_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )

    # Connected subgroup comparisons
    c_conn = r0_conn["subgroups"]["twoHopConnected"]
    c_stat = r0_stat["subgroups"]["twoHopConnected"]
    c_base = r0_base["subgroups"]["twoHopConnected"]
    boot_conn_vs_stat = compute_paired_bootstrap_differences(
        c_conn["reciprocalRanks"],
        c_stat["reciprocalRanks"],
        c_conn["hitsAt10"],
        c_stat["hitsAt10"],
        c_conn["poolScores"],
        c_stat["poolScores"],
        c_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )
    boot_conn_vs_base = compute_paired_bootstrap_differences(
        c_conn["reciprocalRanks"],
        c_base["reciprocalRanks"],
        c_conn["hitsAt10"],
        c_base["hitsAt10"],
        c_conn["poolScores"],
        c_base["poolScores"],
        c_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )

    # Disconnected subgroup comparisons
    d_conn = r0_conn["subgroups"]["twoHopDisconnected"]
    d_stat = r0_stat["subgroups"]["twoHopDisconnected"]
    d_base = r0_base["subgroups"]["twoHopDisconnected"]
    boot_dis_vs_stat = compute_paired_bootstrap_differences(
        d_conn["reciprocalRanks"],
        d_stat["reciprocalRanks"],
        d_conn["hitsAt10"],
        d_stat["hitsAt10"],
        d_conn["poolScores"],
        d_stat["poolScores"],
        d_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )
    boot_dis_vs_base = compute_paired_bootstrap_differences(
        d_conn["reciprocalRanks"],
        d_base["reciprocalRanks"],
        d_conn["hitsAt10"],
        d_base["hitsAt10"],
        d_conn["poolScores"],
        d_base["poolScores"],
        d_conn["poolLabels"],
        n_bootstraps=1000,
        seed=42,
    )

    # Assemble Output Document
    output_doc = {
        "experimentVersion": "v6-connectivity-aware-hybrid-v1",
        "timestamp": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "frozenGraphDatasetHash": "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956",
        "validationQueryCount": len(val_pools),
        "mathematicalFormulation": {
            "functionalForm": "logit(d, c) = w_2hop * s_2hop + w_pop * s_pop + w_rgcn * s_rgcn + w_inter * (s_2hop * s_rgcn) + b",
            "effectiveRGCNWeight": "w_rgcn_eff(c) = w_rgcn + w_inter * s_2hop",
            "continuityProperty": "lim_{s_2hop -> 0+} logit(d, c) = w_pop * s_pop + w_rgcn * s_rgcn + b (zero piecewise cliff)",
            "crossGroupRanking": "Unified monotonic scoring across both connected and disconnected candidates within each pool",
        },
        "scoreContinuityAudit": continuity_audit,
        "featureScaler": scaler.to_dict(),
        "combinerWeights": {
            "feature_names": ["2hop", "popularity", "rgcn", "2hop_x_rgcn_interaction"],
            "weights": conn_weights["weights"],
            "bias": conn_weights["bias"],
            "l2_penalty": conn_weights["l2_penalty"],
        },
        "threeSeedVariability": three_seed_var,
        "seedRuns": seed_runs,
        "comparisonBaselines": {
            "static_full_hybrid_seed42": {
                "mrr": r0_stat["mrr"],
                "hitsAt10Percent": r0_stat["hitsAt10Percent"],
                "auprc": r0_stat["auprc"],
                "subgroups": {
                    "twoHopConnected": {
                        "mrr": r0_stat["subgroups"]["twoHopConnected"]["mrr"],
                        "hitsAt10Percent": r0_stat["subgroups"]["twoHopConnected"]["hitsAt10Percent"],
                        "auprc": r0_stat["subgroups"]["twoHopConnected"]["auprc"],
                    },
                    "twoHopDisconnected": {
                        "mrr": r0_stat["subgroups"]["twoHopDisconnected"]["mrr"],
                        "hitsAt10Percent": r0_stat["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"],
                        "auprc": r0_stat["subgroups"]["twoHopDisconnected"]["auprc"],
                    },
                },
            },
            "two_hop_plus_popularity": {
                "mrr": r0_base["mrr"],
                "hitsAt10Percent": r0_base["hitsAt10Percent"],
                "auprc": r0_base["auprc"],
                "subgroups": {
                    "twoHopConnected": {
                        "mrr": r0_base["subgroups"]["twoHopConnected"]["mrr"],
                        "hitsAt10Percent": r0_base["subgroups"]["twoHopConnected"]["hitsAt10Percent"],
                        "auprc": r0_base["subgroups"]["twoHopConnected"]["auprc"],
                    },
                    "twoHopDisconnected": {
                        "mrr": r0_base["subgroups"]["twoHopDisconnected"]["mrr"],
                        "hitsAt10Percent": r0_base["subgroups"]["twoHopDisconnected"]["hitsAt10Percent"],
                        "auprc": r0_base["subgroups"]["twoHopDisconnected"]["auprc"],
                    },
                },
            },
        },
        "pairedBootstrapConfidenceIntervals": {
            "overall": {
                "connectivityAwareVsStaticFull": boot_overall_vs_stat,
                "connectivityAwareVsTwoHopPlusPopularity": boot_overall_vs_base,
            },
            "subgroups": {
                "twoHopConnected": {
                    "connectivityAwareVsStaticFull": boot_conn_vs_stat,
                    "connectivityAwareVsTwoHopPlusPopularity": boot_conn_vs_base,
                },
                "twoHopDisconnected": {
                    "connectivityAwareVsStaticFull": boot_dis_vs_stat,
                    "connectivityAwareVsTwoHopPlusPopularity": boot_dis_vs_base,
                },
            },
        },
        "leakageAndIsolationAudit": {
            "evaluatedOnTestSet": False,
            "trainFoldsUsedForCombiner": 5,
            "heldOutValidationLabelsUsedForFitting": False,
            "featureScalerFittedStrictlyOnOOF": True,
        },
    }

    out_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output_doc, f, indent=2)

    print(f"\nSaved connectivity-aware metrics to: {out_file}")
    return out_file


if __name__ == "__main__":
    run_experiment()
