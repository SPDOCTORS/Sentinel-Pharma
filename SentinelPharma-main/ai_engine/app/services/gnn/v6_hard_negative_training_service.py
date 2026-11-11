"""SentinelPharma V6 Hard-Negative R-GCN Training Service.

Implements:
1. Disease-frequency-matched and ontology-aware negative sampling for training (training data only).
2. Multi-seed training harness (3 seeds) for experimental R-GCN.
3. Validation candidate evaluation across overall, 2-hop connected, and 2-hop disconnected subgroups.
4. Comparative benchmark against original R-GCN, 2-hop baseline, and popularity control.
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
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6RGCNModel,
    V6TensorGraph,
)

HARD_TRAIN_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_hard_negative_training"


class V6TrainingHardNegativeSampler:
    """Precomputes and samples frequency-matched and ontology-aware unlabelled negatives from training data only."""

    def __init__(
        self,
        train_pairs: List[Dict[str, Any]],
        entities: List[Dict[str, Any]],
        disease_therapeutic_areas: Dict[str, Set[str]],
        disease_ancestors: Dict[str, Set[str]],
        disease_descendants: Dict[str, Set[str]],
        tensor_graph: V6TensorGraph,
    ):
        self.train_pairs = train_pairs
        self.tg = tensor_graph
        self.all_diseases = sorted([e["canonicalId"] for e in entities if e["entityType"] == "DISEASE"])

        # Strictly training data: compute marginal training indication counts
        self.train_counts = Counter(p["disease"] for p in train_pairs)

        # Build forbidden set strictly from training indications + ontology DAG
        self.drug_train_forbidden: Dict[str, Set[str]] = defaultdict(set)
        for p in train_pairs:
            d = p["drug"]
            dis = p["disease"]
            self.drug_train_forbidden[d].add(dis)
            self.drug_train_forbidden[d].update(disease_ancestors.get(dis, set()))
            self.drug_train_forbidden[d].update(disease_descendants.get(dis, set()))

        # Group all graph diseases by frequency tier
        self.disease_by_tier: Dict[int, List[str]] = defaultdict(list)
        for d in self.all_diseases:
            f = self.train_counts.get(d, 0)
            t = get_disease_frequency_tier(f)
            self.disease_by_tier[t].append(d)

        # Precompute candidate negative node indices for each training pair
        self.pair_negative_node_indices: List[List[int]] = []
        for p in train_pairs:
            drug = p["drug"]
            pos_dis = p["disease"]
            pos_f = self.train_counts.get(pos_dis, 0)
            pos_tier = get_disease_frequency_tier(pos_f)
            pos_tas = disease_therapeutic_areas.get(pos_dis, set())
            forbid = self.drug_train_forbidden[drug]

            # Level 1: Same tier + Same Therapeutic Area
            cands_same_tier = [d for d in self.disease_by_tier[pos_tier] if d not in forbid and d != pos_dis]
            same_ta_same_tier = [d for d in cands_same_tier if (disease_therapeutic_areas.get(d, set()) & pos_tas)]

            if len(same_ta_same_tier) >= 5:
                chosen = same_ta_same_tier
            elif len(cands_same_tier) >= 5:
                # Level 2: Same tier across all TAs
                chosen = cands_same_tier
            else:
                # Level 3: Same tier + adjacent tier fallback
                adj_tier = max(0, pos_tier - 1) if pos_tier > 0 else 1
                adj_cands = [d for d in self.disease_by_tier[adj_tier] if d not in forbid and d != pos_dis]
                chosen = cands_same_tier + adj_cands
                if not chosen:
                    chosen = [d for d in self.all_diseases if d not in forbid and d != pos_dis]

            idx_list = [self.tg.node_to_idx[c] for c in chosen]
            self.pair_negative_node_indices.append(idx_list)

    def sample_negatives(self, rng: random.Random) -> List[int]:
        """Draws one hard negative destination node index per training pair."""
        return [rng.choice(pool) for pool in self.pair_negative_node_indices]


class V6HardNegativeRGCNTrainer:
    """Trains R-GCN with hard negative sampling and tracks validation metrics."""

    def __init__(
        self,
        tensor_graph: V6TensorGraph,
        model: V6RGCNModel,
        learning_rate: float = 0.01,
        weight_decay: float = 1e-5,
        device: str = "cpu",
    ):
        self.tg = tensor_graph
        self.model = model.to(device)
        self.device = device
        self.edge_index = tensor_graph.edge_index.to(device)
        self.edge_type = tensor_graph.edge_type.to(device)
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate, weight_decay=weight_decay)

    def train_epoch(
        self,
        train_pairs: List[Dict[str, Any]],
        sampler: V6TrainingHardNegativeSampler,
        seed: int,
    ) -> float:
        self.model.train()
        self.optimizer.zero_grad()

        h = self.model.encode(self.edge_index, self.edge_type)

        pos_src = [self.tg.node_to_idx[p["drug"]] for p in train_pairs]
        pos_dst = [self.tg.node_to_idx[p["disease"]] for p in train_pairs]

        rng = random.Random(seed)
        neg_dst = sampler.sample_negatives(rng)

        pos_src_t = torch.tensor(pos_src, dtype=torch.long, device=self.device)
        pos_dst_t = torch.tensor(pos_dst, dtype=torch.long, device=self.device)
        neg_dst_t = torch.tensor(neg_dst, dtype=torch.long, device=self.device)

        pos_logits = self.model.decode(h, pos_src_t, pos_dst_t)
        neg_logits = self.model.decode(h, pos_src_t, neg_dst_t)

        loss_pos = F.binary_cross_entropy_with_logits(pos_logits, torch.ones_like(pos_logits))
        loss_neg = F.binary_cross_entropy_with_logits(neg_logits, torch.zeros_like(neg_logits))
        loss = loss_pos + loss_neg

        loss.backward()
        self.optimizer.step()
        return float(loss.item())

    @torch.no_grad()
    def evaluate_validation_pools(self, val_pools: List[Dict[str, Any]]) -> Dict[str, Any]:
        self.model.eval()
        h = self.model.encode(self.edge_index, self.edge_type)

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

        for pool in val_pools:
            drug = pool["drug"]
            pos_dis = pool["positiveDisease"]
            candidates = pool["candidatePool"]

            src_idx = self.tg.node_to_idx[drug]
            dst_indices = [self.tg.node_to_idx[c] for c in candidates]

            src_t = torch.full((len(dst_indices),), src_idx, dtype=torch.long, device=self.device)
            dst_t = torch.tensor(dst_indices, dtype=torch.long, device=self.device)

            logits = self.model.decode(h, src_t, dst_t)
            scores = torch.sigmoid(logits).cpu().numpy()

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
            "queryCount": len(val_pools),
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
