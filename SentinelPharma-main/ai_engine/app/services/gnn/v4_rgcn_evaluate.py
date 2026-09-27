"""Experimental leakage-safe R-GCN baseline for ``biomedical_graph_v4``.

This module is deliberately isolated from production inference.  Its protocol
is locked to the Phase 2H persisted split before any model is trained.
"""
from __future__ import annotations

import hashlib
import json
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
from torch_geometric.nn import RGCNConv

from app.services.gnn.v4_leakage_safe_evaluate import binary_metrics, evaluate_scores
from app.services.gnn.v4_link_prediction_dataset import Split, V4LinkPredictionDataset, pair_hash


PHASE_2H_ARTIFACT = Path(__file__).resolve().parents[3] / "artifacts/gnn/evaluations/v4_20260921T083016Z"
RELATION_ID_MAP = {
    "DRUG_INDICATION": 0,
    "DRUG_INDICATION__REVERSE": 1,
    "DRUG_TARGET": 2,
    "DRUG_TARGET__REVERSE": 3,
    "DISEASE_TARGET": 4,
    "DISEASE_TARGET__REVERSE": 5,
    "TARGET_PATHWAY": 6,
    "TARGET_PATHWAY__REVERSE": 7,
}


class RGCNEncoder(nn.Module):
    def __init__(self, in_dim: int, hidden: int = 32, out: int = 32):
        super().__init__()
        self.one = RGCNConv(in_dim, hidden, len(RELATION_ID_MAP))
        self.two = RGCNConv(hidden, out, len(RELATION_ID_MAP))

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor, edge_type: torch.Tensor) -> torch.Tensor:
        value = self.one(x, edge_index, edge_type)
        value = F.dropout(F.relu(value), p=0.15, training=self.training)
        return self.two(value, edge_index, edge_type)


class Predictor(nn.Module):
    def __init__(self, dim: int = 32):
        super().__init__()
        self.layers = nn.Sequential(nn.Linear(dim * 2, dim), nn.ReLU(), nn.Linear(dim, 1))

    def forward(self, left: torch.Tensor, right: torch.Tensor) -> torch.Tensor:
        return self.layers(torch.cat([left, right], dim=-1)).squeeze(-1)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def relation_tensor_graph(dataset: V4LinkPredictionDataset, split: Split) -> dict[str, Any]:
    """Build a directed, typed message graph after held-label masking."""
    relations = dataset.masked_relations(split)
    nodes = tuple(sorted(dataset.nodes))
    index = {node: position for position, node in enumerate(nodes)}
    typed_edges: list[tuple[int, int, int]] = []
    for item in relations:
        relation = item["relationType"]
        typed_edges.append((index[item["source"]], index[item["target"]], RELATION_ID_MAP[relation]))
        typed_edges.append((index[item["target"]], index[item["source"]], RELATION_ID_MAP[f"{relation}__REVERSE"]))
    edge_index = torch.tensor([(left, right) for left, right, _ in typed_edges], dtype=torch.long).t().contiguous()
    edge_type = torch.tensor([relation for _, _, relation in typed_edges], dtype=torch.long)
    types = sorted(set(dataset.nodes.values()))
    type_index = {entity_type: position for position, entity_type in enumerate(types)}
    degree = torch.bincount(edge_index[0], minlength=len(nodes)).float()
    maximum = max(float(degree.max()), 1.0)
    x = torch.zeros((len(nodes), len(types) + 1), dtype=torch.float)
    for node, position in index.items():
        x[position, type_index[dataset.nodes[node]]] = 1
        x[position, -1] = degree[position] / maximum
    held = set(split.validation) | set(split.test)
    for drug, disease in held:
        assert (index[drug], index[disease], RELATION_ID_MAP["DRUG_INDICATION"]) not in typed_edges
        assert (index[disease], index[drug], RELATION_ID_MAP["DRUG_INDICATION__REVERSE"]) not in typed_edges
    return {
        "relations": relations,
        "index": index,
        "x": x,
        "edge_index": edge_index,
        "edge_type": edge_type,
        "typedEdges": tuple(typed_edges),
        "relationIdMap": dict(RELATION_ID_MAP),
        "nodeFeatureDefinition": "entity-type one-hot plus masked-message-graph normalized out-degree",
    }


def _phase_2h_manifest(root: Path) -> dict[str, Any]:
    manifest_path = root / "experiment_manifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"Required Phase 2H artifact is missing: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def persisted_phase_2h_split(dataset: V4LinkPredictionDataset, root: Path = PHASE_2H_ARTIFACT) -> tuple[Split, dict[str, Any]]:
    manifest = _phase_2h_manifest(root)
    split_data = manifest.get("split")
    if manifest.get("graph", {}).get("datasetHash") != dataset.graph.get("datasetHash"):
        raise ValueError("Phase 2H graph hash differs from requested V4 graph")
    split = dataset.split("per_drug_stratified", int(split_data["seed"]))
    if split.manifest() != split_data:
        raise ValueError("Regenerated split does not match persisted Phase 2H split")
    return split, manifest


def _baseline_metrics(dataset: V4LinkPredictionDataset, graph: dict[str, Any], split: Split) -> dict[str, Any]:
    return {
        "global_disease_popularity": evaluate_scores(dataset, split, lambda _, disease: dataset.popularity_score(split.train, disease))[0],
        "drug_target_disease_target_path": evaluate_scores(dataset, split, lambda drug, disease: dataset.structural_path_score(graph["relations"], drug, disease))[0],
    }


def _parameter_count(*modules: nn.Module) -> int:
    return sum(parameter.numel() for module in modules for parameter in module.parameters())


def run_rgcn_baseline(graph_path: Path, output_root: Path, expected_hash: str, *, phase_2h_root: Path = PHASE_2H_ARTIFACT, seeds: tuple[int, ...] = (42, 1337, 2026), epochs: int = 10, negative_ratio: int = 1) -> Path:
    """Train one fixed-budget R-GCN baseline and write a new experiment artifact."""
    dataset = V4LinkPredictionDataset.load(graph_path, expected_hash)
    split, phase_2h = persisted_phase_2h_split(dataset, phase_2h_root)
    graph = relation_tensor_graph(dataset, split)
    out = Path(output_root)
    out.mkdir(parents=True, exist_ok=False)
    baselines = _baseline_metrics(dataset, graph, split)
    evaluation_split = Split(split.strategy, split.seed, split.test, (), (), split.excluded)
    evaluation_negatives = dataset.sample_negatives(evaluation_split, negative_ratio, "uniform", split.seed + 1)
    expected_evaluation_hash = phase_2h["negativeSampling"]["evaluationNegativeHash"]
    if pair_hash(evaluation_negatives) != expected_evaluation_hash:
        raise ValueError("Evaluation negatives do not match persisted Phase 2H protocol")

    seed_results: list[dict[str, Any]] = []
    checkpoints: list[dict[str, str]] = []
    parameter_count = 0
    for seed in seeds:
        set_seed(seed)
        negatives = dataset.sample_negatives(split, negative_ratio, "uniform", seed)
        encoder, predictor = RGCNEncoder(graph["x"].shape[1]), Predictor()
        parameter_count = _parameter_count(encoder, predictor)
        optimizer = torch.optim.Adam(list(encoder.parameters()) + list(predictor.parameters()), lr=0.01, weight_decay=1e-5)
        positive_index = torch.tensor([[graph["index"][drug], graph["index"][disease]] for drug, disease in split.train], dtype=torch.long)
        negative_index = torch.tensor([[graph["index"][drug], graph["index"][disease]] for drug, disease in negatives], dtype=torch.long)
        for _ in range(epochs):
            encoder.train(); predictor.train(); optimizer.zero_grad()
            embeddings = encoder(graph["x"], graph["edge_index"], graph["edge_type"])
            positive_loss = F.binary_cross_entropy_with_logits(predictor(embeddings[positive_index[:, 0]], embeddings[positive_index[:, 1]]), torch.ones(len(positive_index)))
            negative_loss = F.binary_cross_entropy_with_logits(predictor(embeddings[negative_index[:, 0]], embeddings[negative_index[:, 1]]), torch.zeros(len(negative_index)))
            (positive_loss + negative_loss).backward(); optimizer.step()
        encoder.eval(); predictor.eval()
        with torch.no_grad():
            embeddings = encoder(graph["x"], graph["edge_index"], graph["edge_type"])
        def scorer(drug: str, disease: str) -> float:
            return float(torch.sigmoid(predictor(embeddings[graph["index"][drug]].unsqueeze(0), embeddings[graph["index"][disease]].unsqueeze(0))).item())
        ranking, cases = evaluate_scores(dataset, split, scorer)
        sampled = binary_metrics([scorer(*pair) for pair in split.test], [scorer(*pair) for pair in evaluation_negatives])
        seed_results.append({"seed": seed, "selectedEpoch": epochs, "ranking": ranking, "sampledCandidateMetrics": sampled, "negativePairHash": pair_hash(negatives), "evaluationNegativePairHash": pair_hash(evaluation_negatives), "predictionProvenanceLabel": "MODEL_PREDICTION", "cases": cases})
        checkpoint = out / f"rgcn_checkpoint_seed_{seed}.pt"
        torch.save({"encoder": encoder.state_dict(), "predictor": predictor.state_dict(), "graphDatasetHash": dataset.graph["datasetHash"], "seed": seed, "relationIdMap": RELATION_ID_MAP}, checkpoint)
        checkpoints.append({"path": checkpoint.name, "sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest()})

    aggregate = {metric: mean(item["ranking"]["micro"][metric] for item in seed_results) for metric in ("mrr", "hits_at_1", "hits_at_3", "hits_at_5", "hits_at_10")}
    artifact = {
        "model": "RGCN",
        "graph": {"datasetVersion": dataset.graph["datasetVersion"], "datasetHash": dataset.graph["datasetHash"], "path": str(graph_path), "sourceLineage": dataset.graph.get("frozenInputLineage")},
        "phase2hComparisonArtifact": str(phase_2h_root),
        "split": split.manifest(),
        "maskingPolicy": "Phase 2H policy reused: validation/test DRUG_INDICATION edges removed before directed typed tensor construction and degree features; train indication edges remain as in Phase 2H.",
        "relationIdMap": RELATION_ID_MAP,
        "negativeSampling": {"sampler": "uniform", "ratio": negative_ratio, "trainNegativeHashes": [item["negativePairHash"] for item in seed_results], "evaluationNegativeHash": pair_hash(evaluation_negatives), "evaluationSeed": split.seed + 1},
        "modelSeeds": list(seeds),
        "hyperparameters": {"epochs": epochs, "earlyStopping": None, "learningRate": 0.01, "weightDecay": 1e-5, "hiddenDim": 32, "embeddingDim": 32, "dropout": 0.15, "layers": 2, "parameterCount": parameter_count},
        "nodeFeatures": graph["nodeFeatureDefinition"],
        "baselines": baselines,
        "phase2hGraphSage": {"artifact": str(phase_2h_root), "aggregateMicroRanking": json.loads((phase_2h_root / "metrics.json").read_text(encoding="utf-8"))["aggregateMicroRanking"]},
        "runtime": {"python": sys.version, "torch": torch.__version__, "numpy": np.__version__},
        "checkpoints": checkpoints,
    }
    for item in checkpoints:
        if not (out / item["path"]).is_file():
            raise RuntimeError("Checkpoint write failed")
    (out / "experiment_manifest.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    (out / "split_manifest.json").write_text(json.dumps(split.manifest(), indent=2), encoding="utf-8")
    (out / "baseline_metrics.json").write_text(json.dumps(baselines, indent=2), encoding="utf-8")
    (out / "metrics.json").write_text(json.dumps({"perSeed": seed_results, "aggregateMicroRanking": aggregate}, indent=2), encoding="utf-8")
    return out


def timestamped_output(root: Path) -> Path:
    return Path(root) / f"v4_rgcn_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
