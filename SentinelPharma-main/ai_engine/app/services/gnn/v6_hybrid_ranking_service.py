"""SentinelPharma V6 Hybrid Ranking Service.

Implements:
1. Leakage-free Out-Of-Fold (OOF) training feature generation (2-hop, popularity, hard-negative R-GCN).
2. Training-set feature standardizer (never fit on validation or test).
3. L2-regularized logistic ranking combiner.
4. Feature ablation suite (Full, w/o Popularity, w/o R-GCN, w/o 2-hop, and single baselines).
5. 3-seed variability benchmarking on validation hard candidate pools.
"""
from __future__ import annotations

import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pyarrow.parquet as pq
import torch
import torch.nn as nn
import torch.nn.functional as F

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6TwoHopBaselineScorer,
    compute_auprc_auroc,
    normalize_disease_canonical,
)
from app.services.gnn.v6_hard_negative_eval import (
    HARD_EVAL_OUTPUT_DIR,
    get_disease_frequency_tier,
)
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

HYBRID_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_hybrid_ranking"


class TrainingFeatureScaler:
    """Standardizes features using statistics computed strictly from training data."""

    def __init__(self):
        self.mean: Optional[np.ndarray] = None
        self.std: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray) -> TrainingFeatureScaler:
        self.mean = np.mean(X, axis=0)
        self.std = np.std(X, axis=0)
        self.std[self.std < 1e-8] = 1.0
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self.mean is None or self.std is None:
            raise ValueError("Scaler has not been fitted on training data yet.")
        return (X - self.mean) / self.std

    def to_dict(self) -> Dict[str, List[float]]:
        return {
            "mean": self.mean.tolist() if self.mean is not None else [],
            "std": self.std.tolist() if self.std is not None else [],
        }


class RegularizedLogisticRanker:
    """L2-regularized logistic regression ranking combiner."""

    def __init__(self, num_features: int, l2_penalty: float = 0.05, lr: float = 0.05, epochs: int = 200):
        self.num_features = num_features
        self.l2_penalty = l2_penalty
        self.lr = lr
        self.epochs = epochs
        self.linear = nn.Linear(num_features, 1)

    def fit(self, X_norm: np.ndarray, y: np.ndarray, seed: int = 42) -> RegularizedLogisticRanker:
        torch.manual_seed(seed)
        nn.init.zeros_(self.linear.weight)
        nn.init.zeros_(self.linear.bias)

        X_t = torch.tensor(X_norm, dtype=torch.float32)
        y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

        optimizer = torch.optim.Adam(self.linear.parameters(), lr=self.lr, weight_decay=self.l2_penalty)
        criterion = nn.BCEWithLogitsLoss()

        self.linear.train()
        for _ in range(self.epochs):
            optimizer.zero_grad()
            logits = self.linear(X_t)
            loss = criterion(logits, y_t)
            loss.backward()
            optimizer.step()

        self.linear.eval()
        return self

    def predict_logits(self, X_norm: np.ndarray) -> np.ndarray:
        self.linear.eval()
        with torch.no_grad():
            X_t = torch.tensor(X_norm, dtype=torch.float32)
            logits = self.linear(X_t).squeeze(-1).numpy()
        return logits

    def get_weights(self) -> Dict[str, Any]:
        return {
            "weights": self.linear.weight.data.squeeze().numpy().tolist(),
            "bias": float(self.linear.bias.data.item()),
            "l2_penalty": self.l2_penalty,
        }


def generate_out_of_fold_training_data(
    train_pairs: List[Dict[str, Any]],
    entities: List[Dict[str, Any]],
    relations: List[Dict[str, Any]],
    disease_therapeutic_areas: Dict[str, Set[str]],
    disease_ancestors: Dict[str, Set[str]],
    disease_descendants: Dict[str, Set[str]],
    n_folds: int = 5,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray]:
    """Generates strictly out-of-fold feature predictions on training data using K-fold CV."""
    tensor_graph = V6TensorGraph(entities, relations)
    two_hop_scorer = V6TwoHopBaselineScorer(relations)

    fold_size = len(train_pairs) // n_folds
    rng = random.Random(seed)

    oof_features: List[List[float]] = []
    oof_labels: List[int] = []

    for fold in range(n_folds):
        val_idx_start = fold * fold_size
        val_idx_end = (fold + 1) * fold_size if fold < n_folds - 1 else len(train_pairs)
        val_indices = set(range(val_idx_start, val_idx_end))

        train_fold = [p for i, p in enumerate(train_pairs) if i not in val_indices]
        val_fold = [p for i, p in enumerate(train_pairs) if i in val_indices]

        fold_train_counts = Counter(p["disease"] for p in train_fold)

        # Train fold R-GCN strictly on train_fold with training hard negative sampler
        sampler_f = V6TrainingHardNegativeSampler(
            train_pairs=train_fold,
            entities=entities,
            disease_therapeutic_areas=disease_therapeutic_areas,
            disease_ancestors=disease_ancestors,
            disease_descendants=disease_descendants,
            tensor_graph=tensor_graph,
        )

        torch.manual_seed(seed + fold)
        model_f = V6RGCNModel(tensor_graph.num_nodes, 64, tensor_graph.num_relations, 4, 0.2)
        trainer_f = V6HardNegativeRGCNTrainer(tensor_graph, model_f, learning_rate=0.01)

        # Train fold model for 6 epochs
        for ep in range(1, 7):
            trainer_f.train_epoch(train_fold, sampler_f, seed=seed * 100 + fold * 10 + ep)

        model_f.eval()
        with torch.no_grad():
            h_f = model_f.encode(tensor_graph.edge_index, tensor_graph.edge_type)

        # Draw out-of-fold hard negatives strictly for val_fold
        val_sampler = V6TrainingHardNegativeSampler(
            train_pairs=val_fold,
            entities=entities,
            disease_therapeutic_areas=disease_therapeutic_areas,
            disease_ancestors=disease_ancestors,
            disease_descendants=disease_descendants,
            tensor_graph=tensor_graph,
        )
        fold_rng = random.Random(seed + fold * 100)
        neg_dst_indices = val_sampler.sample_negatives(fold_rng)

        for i, p in enumerate(val_fold):
            drug = p["drug"]
            pos_dis = p["disease"]

            # Feature 0: 2-Hop score
            s2_pos, _ = two_hop_scorer.score_pair(drug, pos_dis)
            # Feature 1: Disease-popularity score in train_fold
            sp_pos = float(fold_train_counts.get(pos_dis, 0))
            # Feature 2: Fold R-GCN probability
            src_t = torch.tensor([tensor_graph.node_to_idx[drug]])
            dst_pos_t = torch.tensor([tensor_graph.node_to_idx[pos_dis]])
            with torch.no_grad():
                srg_pos = float(torch.sigmoid(model_f.decode(h_f, src_t, dst_pos_t)).item())

            oof_features.append([s2_pos, sp_pos, srg_pos])
            oof_labels.append(1)

            # Sampled hard negative for fold
            neg_idx = neg_dst_indices[i]
            neg_dis = tensor_graph.idx_to_node[neg_idx]

            s2_neg, _ = two_hop_scorer.score_pair(drug, neg_dis)
            sp_neg = float(fold_train_counts.get(neg_dis, 0))
            dst_neg_t = torch.tensor([neg_idx])
            with torch.no_grad():
                srg_neg = float(torch.sigmoid(model_f.decode(h_f, src_t, dst_neg_t)).item())

            oof_features.append([s2_neg, sp_neg, srg_neg])
            oof_labels.append(0)

    return np.array(oof_features, dtype=np.float32), np.array(oof_labels, dtype=np.int32)


def evaluate_hybrid_ranker_on_pools(
    pools: List[Dict[str, Any]],
    feature_extractor_fn: Any,
    scaler: TrainingFeatureScaler,
    ranker: RegularizedLogisticRanker,
    feature_indices: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """Scores candidate ranking pools with normalized logistic ranker and computes subgroup metrics."""
    reciprocal_ranks: List[float] = []
    hits_1: List[int] = []
    hits_5: List[int] = []
    hits_10: List[int] = []
    all_y_true: List[int] = []
    all_y_scores: List[float] = []

    subgroup_rr = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_h10 = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_yt = {"twoHopConnected": [], "twoHopDisconnected": []}
    subgroup_ys = {"twoHopConnected": [], "twoHopDisconnected": []}

    for pool in pools:
        drug = pool["drug"]
        pos_dis = pool["positiveDisease"]
        candidates = pool["candidatePool"]

        # Extract raw features for all candidates
        raw_feats = feature_extractor_fn(drug, candidates)  # shape (100, num_features)
        norm_feats = scaler.transform(raw_feats)

        if feature_indices is not None:
            norm_feats = norm_feats[:, feature_indices]

        scores = ranker.predict_logits(norm_feats)

        # Rank candidates
        ranked_pairs = sorted(zip(candidates, scores), key=lambda item: (-item[1], item[0]))
        rank = next(idx for idx, (cand, _) in enumerate(ranked_pairs, start=1) if cand == pos_dis)
        rr = 1.0 / rank

        reciprocal_ranks.append(rr)
        hits_1.append(1 if rank <= 1 else 0)
        hits_5.append(1 if rank <= 5 else 0)
        hits_10.append(1 if rank <= 10 else 0)

        is_conn = pool.get("isTwoHopConnected", False)
        grp = "twoHopConnected" if is_conn else "twoHopDisconnected"
        subgroup_rr[grp].append(rr)
        subgroup_h10[grp].append(1 if rank <= 10 else 0)

        for cand, sc in zip(candidates, scores):
            yt = 1 if cand == pos_dis else 0
            all_y_true.append(yt)
            all_y_scores.append(float(sc))
            subgroup_yt[grp].append(yt)
            subgroup_ys[grp].append(float(sc))

    auprc, auroc = compute_auprc_auroc(np.array(all_y_true), np.array(all_y_scores))
    conn_auprc, _ = compute_auprc_auroc(np.array(subgroup_yt["twoHopConnected"]), np.array(subgroup_ys["twoHopConnected"])) if subgroup_yt["twoHopConnected"] else (0.0, 0.5)
    disconn_auprc, _ = compute_auprc_auroc(np.array(subgroup_yt["twoHopDisconnected"]), np.array(subgroup_ys["twoHopDisconnected"])) if subgroup_yt["twoHopDisconnected"] else (0.0, 0.5)

    return {
        "queryCount": len(pools),
        "mrr": round(float(np.mean(reciprocal_ranks)), 4),
        "hitsAt1Percent": round(float(np.mean(hits_1) * 100), 2),
        "hitsAt5Percent": round(float(np.mean(hits_5) * 100), 2),
        "hitsAt10Percent": round(float(np.mean(hits_10) * 100), 2),
        "auprc": round(auprc, 4),
        "auroc": round(auroc, 4),
        "subgroups": {
            "twoHopConnected": {
                "count": len(subgroup_rr["twoHopConnected"]),
                "mrr": round(float(np.mean(subgroup_rr["twoHopConnected"])), 4) if subgroup_rr["twoHopConnected"] else 0.0,
                "hitsAt10Percent": round(float(np.mean(subgroup_h10["twoHopConnected"]) * 100), 2) if subgroup_h10["twoHopConnected"] else 0.0,
                "auprc": round(conn_auprc, 4),
            },
            "twoHopDisconnected": {
                "count": len(subgroup_rr["twoHopDisconnected"]),
                "mrr": round(float(np.mean(subgroup_rr["twoHopDisconnected"])), 4) if subgroup_rr["twoHopDisconnected"] else 0.0,
                "hitsAt10Percent": round(float(np.mean(subgroup_h10["twoHopDisconnected"]) * 100), 2) if subgroup_h10["twoHopDisconnected"] else 0.0,
                "auprc": round(disconn_auprc, 4),
            },
        },
    }
