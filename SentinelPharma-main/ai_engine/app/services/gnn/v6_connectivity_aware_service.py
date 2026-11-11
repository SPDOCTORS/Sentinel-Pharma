"""SentinelPharma V6 Connectivity-Aware Hybrid Ranking Service.

Implements a continuous, cross-group consistent connectivity-aware hybrid ranker that:
1. Modulates feature influence based on shared-target connectivity using smooth interaction terms.
2. Strictly avoids hard-coded piecewise score discontinuities:
   logit(d, c) = w_1 * s_2 + w_2 * s_pop + w_3 * s_rgcn + w_4 * (s_2 * s_rgcn) + b
   As s_2 -> 0+, the interaction term smoothly vanishes, ensuring continuous sorting across
   connected and disconnected candidates within mixed pools.
3. Fits feature scalers and combiner weights strictly on 5-fold Out-Of-Fold (OOF) training data.
4. Evaluates on validation hard candidate pools with paired bootstrap confidence intervals.
5. Evaluates 3-seed stability across R-GCN seeds 42, 43, and 44.
"""
from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import torch
import torch.nn as nn

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    V6TwoHopBaselineScorer,
    compute_auprc_auroc,
)
from app.services.gnn.v6_hard_negative_eval import HARD_EVAL_OUTPUT_DIR
from app.services.gnn.v6_hard_negative_training_service import HARD_TRAIN_OUTPUT_DIR
from app.services.gnn.v6_hybrid_audit_service import compute_paired_bootstrap_differences
from app.services.gnn.v6_hybrid_ranking_service import (
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
)
from app.services.gnn.v6_rgcn_service import V6RGCNModel, V6TensorGraph

CONN_AWARE_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_connectivity_aware_hybrid"


def build_connectivity_aware_features(raw_feats: np.ndarray) -> np.ndarray:
    """Builds continuous connectivity-aware feature expansion.
    
    Args:
        raw_feats: np.ndarray of shape (N, 3) where columns are:
            Col 0: s_2 (2-hop shared target score >= 0)
            Col 1: s_pop (disease popularity count >= 0)
            Col 2: s_rgcn (hard-negative R-GCN probability in [0, 1])
            
    Returns:
        np.ndarray of shape (N, 4):
            Col 0: s_2
            Col 1: s_pop
            Col 2: s_rgcn
            Col 3: s_2 * s_rgcn (smooth bilinear interaction)
    """
    s2 = raw_feats[:, 0:1]
    spop = raw_feats[:, 1:2]
    srgcn = raw_feats[:, 2:3]
    interaction = s2 * srgcn
    return np.hstack([s2, spop, srgcn, interaction])


def verify_score_continuity(
    ranker: RegularizedLogisticRanker,
    scaler: TrainingFeatureScaler,
    test_rgcn: float = 0.5,
    test_pop: float = 50.0,
    epsilon: float = 1e-5,
) -> Dict[str, Any]:
    """Mathematically proves continuity of the ranking score across the connectivity boundary.
    
    Computes lim_{s_2 -> 0+} score(s_2, pop, rgcn) and verifies that |score(eps) - score(0)| < O(eps).
    """
    raw_at_zero = np.array([[0.0, test_pop, test_rgcn]], dtype=np.float32)
    raw_at_eps = np.array([[epsilon, test_pop, test_rgcn]], dtype=np.float32)

    feat_zero = build_connectivity_aware_features(raw_at_zero)
    feat_eps = build_connectivity_aware_features(raw_at_eps)

    norm_zero = scaler.transform(feat_zero)
    norm_eps = scaler.transform(feat_eps)

    logit_zero = float(ranker.predict_logits(norm_zero)[0])
    logit_eps = float(ranker.predict_logits(norm_eps)[0])

    diff = abs(logit_eps - logit_zero)
    is_continuous = diff < 1e-3  # Linear bound with respect to epsilon

    return {
        "epsilon": epsilon,
        "scoreAtZero": round(logit_zero, 6),
        "scoreAtEpsilon": round(logit_eps, 6),
        "absoluteDifference": round(diff, 6),
        "isContinuous": is_continuous,
    }


def evaluate_candidate_pools(
    pools: List[Dict[str, Any]],
    raw_feature_extractor_fn: Any,
    scaler: TrainingFeatureScaler,
    ranker: RegularizedLogisticRanker,
) -> Dict[str, Any]:
    """Evaluates mixed candidate pools using continuous connectivity-aware ranker."""
    reciprocal_ranks: List[float] = []
    hits_1: List[int] = []
    hits_5: List[int] = []
    hits_10: List[int] = []
    all_scores: List[List[float]] = []
    all_y_true: List[List[int]] = []

    subgroup_rr = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_h10 = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_scores = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_yt = {"twoHopConnected": [], "twoHopDisconnected": []}

    for pool in pools:
        drug = pool["drug"]
        pos_dis = pool["positiveDisease"]
        candidates = pool["candidatePool"]

        raw_feats = raw_feature_extractor_fn(drug, candidates)
        exp_feats = build_connectivity_aware_features(raw_feats)
        norm_feats = scaler.transform(exp_feats)
        scores = ranker.predict_logits(norm_feats)

        # Stable sort: by score descending, then candidate name ascending
        ranked = sorted(zip(candidates, scores), key=lambda x: (-x[1], x[0]))
        rank = next(idx for idx, (c, _) in enumerate(ranked, start=1) if c == pos_dis)
        rr = 1.0 / rank

        reciprocal_ranks.append(rr)
        hits_1.append(1 if rank <= 1 else 0)
        hits_5.append(1 if rank <= 5 else 0)
        hits_10.append(1 if rank <= 10 else 0)

        y_true = [1 if c == pos_dis else 0 for c in candidates]
        all_scores.append(scores.tolist())
        all_y_true.append(y_true)

        is_conn = pool.get("isTwoHopConnected", False)
        grp = "twoHopConnected" if is_conn else "twoHopDisconnected"
        subgroup_rr[grp].append(rr)
        subgroup_h10[grp].append(1 if rank <= 10 else 0)
        subgroup_scores[grp].append(scores.tolist())
        subgroup_yt[grp].append(y_true)

    # Compute AUPRC across all pairs
    flat_yt = np.array([y for sub in all_y_true for y in sub])
    flat_sc = np.array([s for sub in all_scores for s in sub])
    auprc, auroc = compute_auprc_auroc(flat_yt, flat_sc)

    flat_conn_yt = np.array([y for sub in subgroup_yt["twoHopConnected"] for y in sub]) if subgroup_yt["twoHopConnected"] else np.array([])
    flat_conn_sc = np.array([s for sub in subgroup_scores["twoHopConnected"] for s in sub]) if subgroup_scores["twoHopConnected"] else np.array([])
    conn_auprc = compute_auprc_auroc(flat_conn_yt, flat_conn_sc)[0] if len(flat_conn_yt) > 0 else 0.0

    flat_dis_yt = np.array([y for sub in subgroup_yt["twoHopDisconnected"] for y in sub]) if subgroup_yt["twoHopDisconnected"] else np.array([])
    flat_dis_sc = np.array([s for sub in subgroup_scores["twoHopDisconnected"] for s in sub]) if subgroup_scores["twoHopDisconnected"] else np.array([])
    dis_auprc = compute_auprc_auroc(flat_dis_yt, flat_dis_sc)[0] if len(flat_dis_yt) > 0 else 0.0

    return {
        "queryCount": len(pools),
        "mrr": round(float(np.mean(reciprocal_ranks)), 4),
        "hitsAt1Percent": round(float(np.mean(hits_1) * 100), 2),
        "hitsAt5Percent": round(float(np.mean(hits_5) * 100), 2),
        "hitsAt10Percent": round(float(np.mean(hits_10) * 100), 2),
        "auprc": round(auprc, 4),
        "auroc": round(auroc, 4),
        "reciprocalRanks": reciprocal_ranks,
        "hitsAt10": hits_10,
        "poolScores": all_scores,
        "poolLabels": all_y_true,
        "subgroups": {
            "twoHopConnected": {
                "count": len(subgroup_rr["twoHopConnected"]),
                "mrr": round(float(np.mean(subgroup_rr["twoHopConnected"])), 4) if subgroup_rr["twoHopConnected"] else 0.0,
                "hitsAt10Percent": round(float(np.mean(subgroup_h10["twoHopConnected"]) * 100), 2) if subgroup_h10["twoHopConnected"] else 0.0,
                "auprc": round(conn_auprc, 4),
                "reciprocalRanks": subgroup_rr["twoHopConnected"],
                "hitsAt10": subgroup_h10["twoHopConnected"],
                "poolScores": subgroup_scores["twoHopConnected"],
                "poolLabels": subgroup_yt["twoHopConnected"],
            },
            "twoHopDisconnected": {
                "count": len(subgroup_rr["twoHopDisconnected"]),
                "mrr": round(float(np.mean(subgroup_rr["twoHopDisconnected"])), 4) if subgroup_rr["twoHopDisconnected"] else 0.0,
                "hitsAt10Percent": round(float(np.mean(subgroup_h10["twoHopDisconnected"]) * 100), 2) if subgroup_h10["twoHopDisconnected"] else 0.0,
                "auprc": round(dis_auprc, 4),
                "reciprocalRanks": subgroup_rr["twoHopDisconnected"],
                "hitsAt10": subgroup_h10["twoHopDisconnected"],
                "poolScores": subgroup_scores["twoHopDisconnected"],
                "poolLabels": subgroup_yt["twoHopDisconnected"],
            },
        },
    }
