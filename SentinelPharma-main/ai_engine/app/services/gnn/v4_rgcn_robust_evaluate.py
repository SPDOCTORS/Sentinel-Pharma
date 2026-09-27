"""Repeated, validation-selected R-GCN evaluation for the frozen V4 graph."""
from __future__ import annotations

import hashlib
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import torch
import torch.nn.functional as F

from app.services.gnn.v4_leakage_safe_evaluate import binary_metrics, evaluate_scores
from app.services.gnn.v4_link_prediction_dataset import Split, V4LinkPredictionDataset, pair_hash
from app.services.gnn.v4_rgcn_evaluate import (
    PHASE_2H_ARTIFACT,
    Predictor,
    RGCNEncoder,
    _baseline_metrics,
    _parameter_count,
    persisted_phase_2h_split,
    relation_tensor_graph,
    set_seed,
)

PRIMARY_SPLIT_SEEDS = (42, 1337, 2026, 31415, 27182)
MODEL_SEEDS = (42, 1337, 2026)
MAX_EPOCHS = 100
PATIENCE = 15
V4_ROBUST_REFERENCE = Path(__file__).resolve().parents[3] / "artifacts/gnn/evaluations/v4_rgcn_robust_20260921T084017Z"


def choose_validation_checkpoint(history: Iterable[float], patience: int) -> tuple[int, float, bool]:
    """Return 1-based best epoch using only a validation-MRR sequence."""
    best_epoch, best_value, stale = 0, float("-inf"), 0
    for epoch, value in enumerate(history, 1):
        if value > best_value:
            best_epoch, best_value, stale = epoch, value, 0
        else:
            stale += 1
            if stale >= patience:
                return best_epoch, best_value, True
    return best_epoch, best_value, False


def _score(embeddings: torch.Tensor, predictor: Predictor, index: dict[str, int], drug: str, disease: str) -> float:
    return float(torch.sigmoid(predictor(embeddings[index[drug]].unsqueeze(0), embeddings[index[disease]].unsqueeze(0))).item())


def _failure_rows(dataset: V4LinkPredictionDataset, split: Split, graph: dict[str, Any], scorer, *, top_n: int = 5) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for drug, disease in split.test:
        candidates = dataset.filtered_diseases(drug, disease)
        ranked = sorted(((candidate, scorer(drug, candidate)) for candidate in candidates), key=lambda item: (-item[1], item[0]))
        rank = next(position for position, (candidate, _) in enumerate(ranked, 1) if candidate == disease)
        shared = dataset.structural_path_score(graph["relations"], drug, disease)
        rows.append({
            "drug": drug,
            "heldDisease": disease,
            "rank": rank,
            "score": scorer(drug, disease),
            "candidateDiseaseCount": len(candidates),
            "pathExists": shared > 0,
            "sharedTargetCount": shared,
            "predictionProvenanceLabel": "MODEL_PREDICTION",
            "topPredictedCandidates": [
                {"disease": candidate, "score": score, "candidateState": dataset.pair_state((drug, candidate)), "predictionProvenanceLabel": "MODEL_PREDICTION"}
                for candidate, score in ranked[:top_n]
            ],
        })
    return rows


def _metric_summary(values: list[float]) -> dict[str, float]:
    return {"mean": statistics.mean(values), "median": statistics.median(values), "std": statistics.pstdev(values), "min": min(values), "max": max(values)}


def _train_and_evaluate(dataset: V4LinkPredictionDataset, split: Split, graph: dict[str, Any], *, model_seed: int, maximum_epochs: int, patience: int, checkpoint: Path, negative_ratio: int = 1) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    """Train with validation-only selection, then evaluate the selected state once."""
    set_seed(model_seed)
    negatives = dataset.sample_negatives(split, negative_ratio, "uniform", model_seed)
    evaluation_split = Split(split.strategy, split.seed, split.test, (), (), split.excluded)
    evaluation_negatives = dataset.sample_negatives(evaluation_split, negative_ratio, "uniform", split.seed + 1)
    encoder, predictor = RGCNEncoder(graph["x"].shape[1]), Predictor()
    optimizer = torch.optim.Adam(list(encoder.parameters()) + list(predictor.parameters()), lr=0.01, weight_decay=1e-5)
    positives = torch.tensor([[graph["index"][drug], graph["index"][disease]] for drug, disease in split.train], dtype=torch.long)
    sampled = torch.tensor([[graph["index"][drug], graph["index"][disease]] for drug, disease in negatives], dtype=torch.long)
    best_state: dict[str, Any] | None = None
    validation_history: list[float] = []
    stale = 0
    for epoch in range(1, maximum_epochs + 1):
        encoder.train(); predictor.train(); optimizer.zero_grad()
        embeddings = encoder(graph["x"], graph["edge_index"], graph["edge_type"])
        positive_loss = F.binary_cross_entropy_with_logits(predictor(embeddings[positives[:, 0]], embeddings[positives[:, 1]]), torch.ones(len(positives)))
        negative_loss = F.binary_cross_entropy_with_logits(predictor(embeddings[sampled[:, 0]], embeddings[sampled[:, 1]]), torch.zeros(len(sampled)))
        (positive_loss + negative_loss).backward(); optimizer.step()
        encoder.eval(); predictor.eval()
        with torch.no_grad():
            validation_embeddings = encoder(graph["x"], graph["edge_index"], graph["edge_type"])
        validation_scorer = lambda drug, disease: _score(validation_embeddings, predictor, graph["index"], drug, disease)
        validation_mrr = evaluate_scores(dataset, Split(split.strategy, split.seed, split.train, (), split.validation, split.excluded), validation_scorer)[0]["micro"]["mrr"]
        validation_history.append(validation_mrr)
        if validation_mrr > max(validation_history[:-1], default=float("-inf")):
            best_state = {"encoder": {key: value.detach().clone() for key, value in encoder.state_dict().items()}, "predictor": {key: value.detach().clone() for key, value in predictor.state_dict().items()}}
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break
    selected_epoch, validation_mrr, stopped_early = choose_validation_checkpoint(validation_history, patience)
    if best_state is None:
        raise RuntimeError("No validation checkpoint was selected")
    encoder.load_state_dict(best_state["encoder"]); predictor.load_state_dict(best_state["predictor"])
    encoder.eval(); predictor.eval()
    with torch.no_grad():
        selected_embeddings = encoder(graph["x"], graph["edge_index"], graph["edge_type"])
    scorer = lambda drug, disease: _score(selected_embeddings, predictor, graph["index"], drug, disease)
    ranking, cases = evaluate_scores(dataset, split, scorer)
    sampled_metrics = binary_metrics([scorer(*pair) for pair in split.test], [scorer(*pair) for pair in evaluation_negatives])
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"encoder": encoder.state_dict(), "predictor": predictor.state_dict(), "modelSeed": model_seed, "selectedEpoch": selected_epoch, "validationMrr": validation_mrr, "relationIdMap": graph["relationIdMap"]}, checkpoint)
    checkpoint_info = {"path": str(checkpoint), "sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest()}
    result = {
        "splitSeed": split.seed, "modelSeed": model_seed, "selectedEpoch": selected_epoch, "validationMrr": validation_mrr,
        "epochsRun": len(validation_history), "stoppedEarly": stopped_early, "ranking": ranking,
        "sampledCandidateMetrics": sampled_metrics, "negativePairHash": pair_hash(negatives),
        "evaluationNegativePairHash": pair_hash(evaluation_negatives), "predictionProvenanceLabel": "MODEL_PREDICTION",
        "cases": cases, "checkpoint": checkpoint_info,
    }
    return result, _failure_rows(dataset, split, graph, scorer), checkpoint_info


def run_robust_evaluation(graph_path: Path, output_root: Path, expected_hash: str, *, split_seeds: tuple[int, ...] = PRIMARY_SPLIT_SEEDS, model_seeds: tuple[int, ...] = MODEL_SEEDS, maximum_epochs: int = MAX_EPOCHS, patience: int = PATIENCE, include_cold_start: bool = True) -> Path:
    dataset = V4LinkPredictionDataset.load(graph_path, expected_hash)
    if dataset.graph["datasetVersion"] == "biomedical_graph_v5":
        reference = json.loads((V4_ROBUST_REFERENCE / "experiment_manifest.json").read_text(encoding="utf-8"))
        phase_2h_split = dataset.split("per_drug_stratified", 42)
        reference_split = next(item["split"] for item in reference["splitRecords"] if item["splitSeed"] == 42)
        if phase_2h_split.manifest() != reference_split:
            raise ValueError("V5 primary split differs from persisted V4 positive registry split")
        phase_2h = reference
    else:
        phase_2h_split, phase_2h = persisted_phase_2h_split(dataset, PHASE_2H_ARTIFACT)
    out = Path(output_root); out.mkdir(parents=True, exist_ok=False)
    runs: list[dict[str, Any]] = []
    failure_analysis: list[dict[str, Any]] = []
    split_records: list[dict[str, Any]] = []
    baselines_by_split: dict[str, Any] = {}
    for split_seed in split_seeds:
        split = dataset.split("per_drug_stratified", split_seed)
        if split_seed == 42 and split.manifest() != phase_2h_split.manifest():
            raise ValueError("Primary seed 42 differs from persisted Phase 2H split")
        graph = relation_tensor_graph(dataset, split)
        baselines = _baseline_metrics(dataset, graph, split)
        split_key = str(split_seed); baselines_by_split[split_key] = baselines
        split_records.append({"splitSeed": split_seed, "split": split.manifest()})
        for model_seed in model_seeds:
            checkpoint = out / "checkpoints" / f"primary_split_{split_seed}_model_{model_seed}.pt"
            result, rows, _ = _train_and_evaluate(dataset, split, graph, model_seed=model_seed, maximum_epochs=maximum_epochs, patience=patience, checkpoint=checkpoint)
            result["pathBaselineMrr"] = baselines["drug_target_disease_target_path"]["micro"]["mrr"]
            result["popularityBaselineMrr"] = baselines["global_disease_popularity"]["micro"]["mrr"]
            result["vsPathMrr"] = result["ranking"]["micro"]["mrr"] - result["pathBaselineMrr"]
            result["vsPopularityMrr"] = result["ranking"]["micro"]["mrr"] - result["popularityBaselineMrr"]
            runs.append(result)
            failure_analysis.extend([{**row, "splitSeed": split_seed, "modelSeed": model_seed} for row in rows])
    primary_metrics = {metric: _metric_summary([run["ranking"]["micro"][metric] for run in runs]) for metric in ("mrr", "hits_at_1", "hits_at_3", "hits_at_5", "hits_at_10")}
    primary_metrics["auroc"] = _metric_summary([run["sampledCandidateMetrics"]["auroc"] for run in runs])
    primary_metrics["auprc"] = _metric_summary([run["sampledCandidateMetrics"]["average_precision"] for run in runs])
    per_split = {str(seed): _metric_summary([run["ranking"]["micro"]["mrr"] for run in runs if run["splitSeed"] == seed]) for seed in split_seeds}
    comparison = {"runs": [{"splitSeed": run["splitSeed"], "modelSeed": run["modelSeed"], "rgcnMrr": run["ranking"]["micro"]["mrr"], "pathMrr": run["pathBaselineMrr"], "popularityMrr": run["popularityBaselineMrr"], "vsPathMrr": run["vsPathMrr"], "vsPopularityMrr": run["vsPopularityMrr"]} for run in runs], "rgcnExceedsPath": sum(run["vsPathMrr"] > 0 for run in runs), "rgcnExceedsPopularity": sum(run["vsPopularityMrr"] > 0 for run in runs)}
    cold_metrics: dict[str, Any] = {}
    if include_cold_start:
        for strategy in ("cold_drug", "cold_disease"):
            split = dataset.split(strategy, 42)
            if not split.train or not split.test:
                cold_metrics[strategy] = {"status": "not_meaningful", "reason": "empty train or test split"}
                continue
            graph = relation_tensor_graph(dataset, split)
            cold_runs = []
            for model_seed in model_seeds:
                checkpoint = out / "checkpoints" / f"{strategy}_split_42_model_{model_seed}.pt"
                result, _, _ = _train_and_evaluate(dataset, split, graph, model_seed=model_seed, maximum_epochs=maximum_epochs, patience=patience, checkpoint=checkpoint)
                cold_runs.append(result)
            cold_metrics[strategy] = {"status": "diagnostic", "split": split.manifest(), "aggregateMrr": _metric_summary([run["ranking"]["micro"]["mrr"] for run in cold_runs]), "runs": cold_runs}
    checkpoints = [run["checkpoint"] for run in runs] + [run["checkpoint"] for diagnostic in cold_metrics.values() if diagnostic.get("status") == "diagnostic" for run in diagnostic["runs"]]
    manifest = {"model": "RGCN", "graph": {"datasetVersion": dataset.graph["datasetVersion"], "datasetHash": dataset.graph["datasetHash"], "path": str(graph_path), "sourceLineage": dataset.graph.get("frozenInputLineage")}, "splitSeeds": list(split_seeds), "modelSeeds": list(model_seeds), "splitRecords": split_records, "relationIdMap": graph["relationIdMap"], "maskingPolicy": "Validation/test DRUG_INDICATION edges and their reverse forms are removed before typed message construction and degree computation. Training indication edges follow Phase 2H policy.", "negativeSampling": {"sampler": "uniform", "ratio": 1, "evaluationSeedRule": "split_seed + 1", "allKnownPositivesExcluded": True}, "hyperparameters": {"hiddenDim": 32, "embeddingDim": 32, "layers": 2, "dropout": 0.15, "learningRate": 0.01, "weightDecay": 1e-5, "parameterCount": _parameter_count(RGCNEncoder(graph["x"].shape[1]), Predictor())}, "earlyStopping": {"selectionMetric": "validation filtered MRR", "maximumEpochs": maximum_epochs, "patience": patience, "testMetricsUsedForSelection": False}, "v4SplitReference": str(V4_ROBUST_REFERENCE) if dataset.graph["datasetVersion"] == "biomedical_graph_v5" else None, "runtime": {"python": sys.version, "torch": torch.__version__, "numpy": np.__version__}, "checkpoints": checkpoints}
    (out / "experiment_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (out / "aggregate_metrics.json").write_text(json.dumps({"primary": primary_metrics, "perSplitMrr": per_split}, indent=2), encoding="utf-8")
    (out / "per_run_metrics.json").write_text(json.dumps(runs, indent=2), encoding="utf-8")
    (out / "baseline_comparison.json").write_text(json.dumps({"baselinesBySplit": baselines_by_split, **comparison}, indent=2), encoding="utf-8")
    (out / "failure_analysis.json").write_text(json.dumps(failure_analysis, indent=2), encoding="utf-8")
    (out / "cold_start_metrics.json").write_text(json.dumps(cold_metrics, indent=2), encoding="utf-8")
    return out


def timestamped_output(root: Path) -> Path:
    return Path(root) / f"v4_rgcn_robust_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
