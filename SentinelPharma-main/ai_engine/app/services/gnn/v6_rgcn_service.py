"""SentinelPharma V6 R-GCN Service and Model Architecture.

Implements:
1. V6 Relational Graph Convolutional Network (R-GCN) link predictor.
2. Tensor graph builder mapping 12,985 entities and 8 directed relation types.
3. Bioactivity unit audit pre-flight verification.
4. Training loop with validation early stopping on fixed 100-candidate ranking pools.
5. Subgroup comparison against frozen 2-hop baseline (connected vs disconnected).
"""
from __future__ import annotations

import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import RGCNConv

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6BaselineEvaluator,
    V6TwoHopBaselineScorer,
    compute_auprc_auroc,
)

OUTPUT_RGCN_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_rgcn"


def audit_bioactivity_units(graph_relations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Audits bioactivity relation types, unit standardization (nM), and value distributions."""
    bio_edges = [r for r in graph_relations if r["relationType"] == "DRUG_TARGET_BIOACTIVITY"]
    type_counts = Counter()
    values = []

    for r in bio_edges:
        meta = r.get("provenance", [{}])[0].get("metadata", {})
        st = meta.get("standardType", "UNKNOWN")
        sv = meta.get("standardValue")
        type_counts[st] += 1
        if sv is not None:
            values.append(float(sv))

    vals_arr = np.array(values) if values else np.array([0.0])
    return {
        "totalBioactivityEdges": len(bio_edges),
        "standardUnits": "nM (nanomolar in ChEMBL standard_units)",
        "potencyThreshold": "<= 1000.0 nM (1.0 uM high-affinity cutoff)",
        "standardTypeBreakdown": dict(type_counts),
        "distributionSummary": {
            "min_nM": round(float(np.min(vals_arr)), 4),
            "p25_nM": round(float(np.percentile(vals_arr, 25)), 2),
            "median_nM": round(float(np.median(vals_arr)), 2),
            "mean_nM": round(float(np.mean(vals_arr)), 2),
            "p75_nM": round(float(np.percentile(vals_arr, 75)), 2),
            "max_nM": round(float(np.max(vals_arr)), 2),
        },
        "allValuesWithinOneMicromolar": bool(np.all(vals_arr <= 1000.0)),
    }


class V6TensorGraph:
    """Encodes canonical V6 entities and relations into PyTorch Geometric tensor format."""

    RELATION_MAP = {
        "DRUG_TARGET_CURATED_MECHANISM": 0,
        "REV_DRUG_TARGET_CURATED_MECHANISM": 1,
        "DRUG_TARGET_BIOACTIVITY": 2,
        "REV_DRUG_TARGET_BIOACTIVITY": 3,
        "DISEASE_TARGET": 4,
        "REV_DISEASE_TARGET": 5,
        "TARGET_PATHWAY": 6,
        "REV_TARGET_PATHWAY": 7,
    }

    def __init__(self, entities: List[Dict[str, Any]], relations: List[Dict[str, Any]]):
        self.node_to_idx = {e["canonicalId"]: i for i, e in enumerate(entities)}
        self.idx_to_node = {i: e["canonicalId"] for i, e in enumerate(entities)}
        self.num_nodes = len(entities)

        edges_src: List[int] = []
        edges_dst: List[int] = []
        edge_types: List[int] = []

        for r in relations:
            u_id, v_id, rel = r["source"], r["target"], r["relationType"]
            if u_id in self.node_to_idx and v_id in self.node_to_idx:
                u = self.node_to_idx[u_id]
                v = self.node_to_idx[v_id]
                fwd_type = self.RELATION_MAP[rel]
                rev_type = fwd_type + 1

                # Forward edge
                edges_src.append(u)
                edges_dst.append(v)
                edge_types.append(fwd_type)

                # Reverse edge
                edges_src.append(v)
                edges_dst.append(u)
                edge_types.append(rev_type)

        self.edge_index = torch.tensor([edges_src, edges_dst], dtype=torch.long)
        self.edge_type = torch.tensor(edge_types, dtype=torch.long)
        self.num_relations = len(self.RELATION_MAP)


class V6RGCNModel(nn.Module):
    """2-Layer Relational Graph Convolutional Network with DistMult/MLP link predictor."""

    def __init__(self, num_nodes: int, hidden_dim: int = 64, num_relations: int = 8, num_bases: int = 4, dropout: float = 0.2):
        super().__init__()
        self.num_nodes = num_nodes
        self.hidden_dim = hidden_dim

        # Learnable node embedding table
        self.node_embeddings = nn.Embedding(num_nodes, hidden_dim)
        nn.init.xavier_uniform_(self.node_embeddings.weight)

        # 2-layer R-GCN encoder
        self.conv1 = RGCNConv(hidden_dim, hidden_dim, num_relations=num_relations, num_bases=num_bases)
        self.conv2 = RGCNConv(hidden_dim, hidden_dim, num_relations=num_relations, num_bases=num_bases)
        self.dropout = nn.Dropout(dropout)
        self.layer_norm = nn.LayerNorm(hidden_dim)

        # DistMult relation weight for indication link prediction
        self.rel_weight = nn.Parameter(torch.ones(hidden_dim))

        # MLP predictor head
        self.predictor = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, 1),
        )

    def encode(self, edge_index: torch.Tensor, edge_type: torch.Tensor) -> torch.Tensor:
        x = self.node_embeddings.weight
        h = self.conv1(x, edge_index, edge_type)
        h = F.relu(h)
        h = self.dropout(h)
        h = self.conv2(h, edge_index, edge_type)
        h = self.layer_norm(h)
        return h

    def decode(self, h: torch.Tensor, src_idx: torch.Tensor, dst_idx: torch.Tensor) -> torch.Tensor:
        z_src = h[src_idx]
        z_dst = h[dst_idx]

        # Combined DistMult + MLP score
        distmult_score = torch.sum(z_src * self.rel_weight * z_dst, dim=-1, keepdim=True)
        mlp_score = self.predictor(torch.cat([z_src, z_dst], dim=-1))
        logits = (distmult_score + mlp_score).squeeze(-1)
        return logits


class V6RGCNTrainer:
    """Manages R-GCN training, early stopping, and validation benchmarking."""

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

    def train_epoch(self, train_pairs: List[Dict[str, Any]], all_disease_indices: List[int], seed: int) -> float:
        self.model.train()
        self.optimizer.zero_grad()

        h = self.model.encode(self.edge_index, self.edge_type)

        # Prepare positive edges
        pos_src = [self.tg.node_to_idx[p["drug"]] for p in train_pairs]
        pos_dst = [self.tg.node_to_idx[p["disease"]] for p in train_pairs]

        # Uniform negative sampling per positive pair
        rng = random.Random(seed)
        neg_dst = [rng.choice(all_disease_indices) for _ in pos_src]

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
        hits_20: List[int] = []

        all_y_true: List[int] = []
        all_y_scores: List[float] = []

        subgroup_rr = {"connected": [], "disconnected": []}
        subgroup_h10 = {"connected": [], "disconnected": []}

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

            # Rank candidate diseases
            ranked_pairs = sorted(zip(candidates, scores), key=lambda item: (-item[1], item[0]))
            rank = next(idx for idx, (cand, _) in enumerate(ranked_pairs, start=1) if cand == pos_dis)
            rr = 1.0 / rank

            reciprocal_ranks.append(rr)
            h1 = 1 if rank <= 1 else 0
            h5 = 1 if rank <= 5 else 0
            h10 = 1 if rank <= 10 else 0
            h20 = 1 if rank <= 20 else 0

            hits_1.append(h1)
            hits_5.append(h5)
            hits_10.append(h10)
            hits_20.append(h20)

            for cand, sc in zip(candidates, scores):
                all_y_true.append(1 if cand == pos_dis else 0)
                all_y_scores.append(float(sc))

            # Subgroup tagging: check if positive disease has 2-hop connection
            is_connected = pool.get("isTwoHopConnected", False)
            grp = "connected" if is_connected else "disconnected"
            subgroup_rr[grp].append(rr)
            subgroup_h10[grp].append(h10)

        auprc, auroc = compute_auprc_auroc(np.array(all_y_true), np.array(all_y_scores))

        return {
            "queryCount": len(val_pools),
            "mrr": round(float(np.mean(reciprocal_ranks)), 4),
            "hitsAt1Percent": round(float(np.mean(hits_1) * 100), 2),
            "hitsAt5Percent": round(float(np.mean(hits_5) * 100), 2),
            "hitsAt10Percent": round(float(np.mean(hits_10) * 100), 2),
            "hitsAt20Percent": round(float(np.mean(hits_20) * 100), 2),
            "auprc": round(auprc, 4),
            "auroc": round(auroc, 4),
            "subgroups": {
                "twoHopConnected": {
                    "count": len(subgroup_rr["connected"]),
                    "mrr": round(float(np.mean(subgroup_rr["connected"])), 4) if subgroup_rr["connected"] else 0.0,
                    "hitsAt10Percent": round(float(np.mean(subgroup_h10["connected"]) * 100), 2) if subgroup_h10["connected"] else 0.0,
                },
                "twoHopDisconnected": {
                    "count": len(subgroup_rr["disconnected"]),
                    "mrr": round(float(np.mean(subgroup_rr["disconnected"])), 4) if subgroup_rr["disconnected"] else 0.0,
                    "hitsAt10Percent": round(float(np.mean(subgroup_h10["disconnected"]) * 100), 2) if subgroup_h10["disconnected"] else 0.0,
                },
            },
        }
