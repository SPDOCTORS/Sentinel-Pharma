"""Experimental, leakage-safe GraphSAGE baseline for biomedical_graph_v4 only."""
from __future__ import annotations

import hashlib
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv

from app.services.gnn.v4_link_prediction_dataset import Split, V4LinkPredictionDataset, pair_hash, stable_hash


class Encoder(nn.Module):
    def __init__(self, in_dim: int, hidden: int = 64, out: int = 64):
        super().__init__(); self.one = SAGEConv(in_dim, hidden); self.two = SAGEConv(hidden, out)
    def forward(self, x, edge_index): return self.two(F.dropout(F.relu(self.one(x, edge_index)), p=.15, training=self.training), edge_index)


class Predictor(nn.Module):
    def __init__(self, dim: int = 64): super().__init__(); self.layers = nn.Sequential(nn.Linear(dim * 2, dim), nn.ReLU(), nn.Linear(dim, 1))
    def forward(self, left, right): return self.layers(torch.cat([left, right], -1)).squeeze(-1)


def set_seed(seed: int) -> None:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True); torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False


def tensor_graph(dataset: V4LinkPredictionDataset, split: Split) -> dict[str, Any]:
    relations = dataset.masked_relations(split); nodes = tuple(sorted(dataset.nodes)); index = {node: i for i, node in enumerate(nodes)}
    pairs = [(index[item["source"]], index[item["target"]]) for item in relations]
    pairs += [(right, left) for left, right in pairs]
    edge_index = torch.tensor(pairs, dtype=torch.long).t().contiguous()
    types = sorted(set(dataset.nodes.values())); type_idx = {typ: i for i, typ in enumerate(types)}
    degree = torch.bincount(edge_index[0], minlength=len(nodes)).float(); maximum = max(float(degree.max()), 1.0)
    x = torch.zeros((len(nodes), len(types) + 1), dtype=torch.float)
    for node, idx in index.items(): x[idx, type_idx[dataset.nodes[node]]] = 1; x[idx, -1] = degree[idx] / maximum
    held = set(split.validation) | set(split.test)
    for drug, disease in held:
        assert (index[drug], index[disease]) not in pairs and (index[disease], index[drug]) not in pairs
    return {"relations": relations, "index": index, "x": x, "edge_index": edge_index, "nodeFeatureDefinition": "entity-type one-hot plus masked-message-graph normalized degree"}


def rank_metrics(ranks: list[int], pairs: list[tuple[str, str]]) -> dict[str, Any]:
    values = {"mrr": mean(1 / rank for rank in ranks), **{f"hits_at_{k}": mean(rank <= k for rank in ranks) for k in (1, 3, 5, 10)}}
    by_drug: dict[str, list[int]] = {}
    for (drug, _), rank in zip(pairs, ranks): by_drug.setdefault(drug, []).append(rank)
    macro = {"mrr": mean(mean(1 / rank for rank in group) for group in by_drug.values()), **{f"hits_at_{k}": mean(mean(rank <= k for rank in group) for group in by_drug.values()) for k in (1, 3, 5, 10)}}
    return {"micro": values, "perDrugMacro": macro, "caseCount": len(ranks)}


def binary_metrics(positive_scores: list[float], negative_scores: list[float]) -> dict[str, float]:
    # Pairwise AUROC and average precision, both relative to sampled candidates only.
    auc = mean((score > neg) + .5 * (score == neg) for score in positive_scores for neg in negative_scores)
    ranked = sorted([(score, 1) for score in positive_scores] + [(score, 0) for score in negative_scores], reverse=True)
    hits = 0; precisions = []
    for index, (_, label) in enumerate(ranked, 1):
        if label: hits += 1; precisions.append(hits / index)
    return {"auroc": auc, "average_precision": mean(precisions)}


def baseline_scores(dataset: V4LinkPredictionDataset, graph: dict[str, Any], split: Split, pair: tuple[str, str]) -> tuple[int, int]:
    drug, disease = pair
    return dataset.popularity_score(split.train, disease), dataset.structural_path_score(graph["relations"], drug, disease)


def evaluate_scores(dataset: V4LinkPredictionDataset, split: Split, score: Callable[[str, str], float]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    ranks, cases = [], []
    for drug, disease in split.test:
        candidates = dataset.filtered_diseases(drug, disease)
        ordered = sorted(((candidate, score(drug, candidate)) for candidate in candidates), key=lambda item: (-item[1], item[0]))
        rank = next(index for index, (candidate, _) in enumerate(ordered, 1) if candidate == disease)
        ranks.append(rank); cases.append({"drug": drug, "disease": disease, "rank": rank, "candidateSetSize": len(candidates), "provenanceLabel": "MODEL_PREDICTION"})
    return rank_metrics(ranks, list(split.test)), cases


def run_smoke(graph_path: Path, output_root: Path, expected_hash: str, seeds: tuple[int, ...] = (42, 1337, 2026), epochs: int = 10, negative_ratio: int = 1) -> Path:
    dataset = V4LinkPredictionDataset.load(graph_path, expected_hash); split_seed = seeds[0]; split = dataset.split("per_drug_stratified", split_seed)
    out = Path(output_root); out.mkdir(parents=True, exist_ok=False)
    graph = tensor_graph(dataset, split); baselines = {}
    evaluation_split = Split(split.strategy, split.seed, split.test, (), (), split.excluded)
    evaluation_negatives = dataset.sample_negatives(evaluation_split, negative_ratio, "uniform", split_seed + 1)
    for name, scorer in {"global_disease_popularity": lambda d, disease: dataset.popularity_score(split.train, disease), "drug_target_disease_target_path": lambda d, disease: dataset.structural_path_score(graph["relations"], d, disease)}.items(): baselines[name] = evaluate_scores(dataset, split, scorer)[0]
    seed_results, checkpoints = [], []
    for seed in seeds:
        set_seed(seed); negatives = dataset.sample_negatives(split, negative_ratio, "uniform", seed)
        index, x, edge_index = graph["index"], graph["x"], graph["edge_index"]
        encoder, predictor = Encoder(x.shape[1]), Predictor(); optimizer = torch.optim.Adam(list(encoder.parameters()) + list(predictor.parameters()), lr=.01, weight_decay=1e-5)
        positive_idx = torch.tensor([[index[a], index[b]] for a, b in split.train], dtype=torch.long); negative_idx = torch.tensor([[index[a], index[b]] for a, b in negatives], dtype=torch.long)
        for _ in range(epochs):
            encoder.train(); predictor.train(); optimizer.zero_grad(); z = encoder(x, edge_index)
            loss = F.binary_cross_entropy_with_logits(predictor(z[positive_idx[:,0]], z[positive_idx[:,1]]), torch.ones(len(positive_idx))) + F.binary_cross_entropy_with_logits(predictor(z[negative_idx[:,0]], z[negative_idx[:,1]]), torch.zeros(len(negative_idx))); loss.backward(); optimizer.step()
        encoder.eval(); predictor.eval()
        with torch.no_grad(): z = encoder(x, edge_index)
        scorer = lambda drug, disease: float(torch.sigmoid(predictor(z[index[drug]].unsqueeze(0), z[index[disease]].unsqueeze(0))).item())
        ranking, cases = evaluate_scores(dataset, split, scorer)
        sampled = binary_metrics([scorer(*pair) for pair in split.test], [scorer(*pair) for pair in evaluation_negatives])
        seed_results.append({"seed": seed, "ranking": ranking, "sampledCandidateMetrics": sampled, "negativePairHash": pair_hash(negatives), "evaluationNegativePairHash": pair_hash(evaluation_negatives), "predictionProvenanceLabel": "MODEL_PREDICTION", "cases": cases})
        checkpoint = out / f"checkpoint_seed_{seed}.pt"; torch.save({"encoder": encoder.state_dict(), "predictor": predictor.state_dict(), "graphDatasetHash": dataset.graph["datasetHash"], "seed": seed}, checkpoint); checkpoints.append({"path": checkpoint.name, "sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest()})
    # Checkpoints are intentionally generated only by this successful smoke run.
    for item in checkpoints:
        source = out / item["path"]
        if not source.exists(): raise RuntimeError("Checkpoint write failed")
    aggregate = {metric: mean(result["ranking"]["micro"][metric] for result in seed_results) for metric in ("mrr", "hits_at_1", "hits_at_3", "hits_at_5", "hits_at_10")}
    artifact = {"graph": {"datasetVersion": dataset.graph["datasetVersion"], "datasetHash": dataset.graph["datasetHash"], "path": str(graph_path), "sourceLineage": dataset.graph.get("frozenInputLineage")}, "split": split.manifest(), "maskingPolicy": "all validation/test DRUG_INDICATION pairs removed before bidirectional tensor construction; degree computed after masking", "negativeSampling": {"sampler": "uniform", "ratio": negative_ratio, "trainNegativeHashes": [item["negativePairHash"] for item in seed_results], "evaluationNegativeHash": pair_hash(evaluation_negatives), "evaluationSeed": split_seed + 1}, "modelSeeds": list(seeds), "splitSeed": split_seed, "nodeFeatures": graph["nodeFeatureDefinition"], "architecture": "experimental homogeneous GraphSAGE: 2 SAGEConv, ReLU, dropout=0.15, MLP predictor; relation types retained by dataset but ignored by encoder", "hyperparameters": {"epochs": epochs, "learningRate": .01, "hiddenDim": 64, "embeddingDim": 64}, "baselines": list(baselines), "runtime": {"python": sys.version, "torch": torch.__version__, "numpy": np.__version__}, "checkpoints": checkpoints}
    (out / "experiment_manifest.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    (out / "split_manifest.json").write_text(json.dumps(split.manifest(), indent=2), encoding="utf-8")
    (out / "baseline_metrics.json").write_text(json.dumps(baselines, indent=2), encoding="utf-8")
    (out / "metrics.json").write_text(json.dumps({"perSeed": seed_results, "aggregateMicroRanking": aggregate}, indent=2), encoding="utf-8")
    return out


def timestamped_output(root: Path) -> Path:
    return Path(root) / f"v4_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
