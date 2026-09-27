import json
from pathlib import Path

from app.services.gnn.v4_link_prediction_dataset import V4LinkPredictionDataset
from app.services.gnn.v4_rgcn_robust_evaluate import choose_validation_checkpoint, run_robust_evaluation


GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"


def test_checkpoint_selection_uses_validation_history_only():
    assert choose_validation_checkpoint([0.2, 0.4, 0.3, 0.2], 2) == (2, 0.4, True)
    # No test score is accepted by the checkpoint-selection API.
    assert choose_validation_checkpoint([0.1, 0.3, 0.25], 15)[:2] == (2, 0.3)


def test_repeated_split_determinism_and_unknown_failure_candidate_labels(tmp_path):
    first = run_robust_evaluation(GRAPH, tmp_path / "one", HASH, split_seeds=(42,), model_seeds=(42,), maximum_epochs=1, patience=1, include_cold_start=False)
    second = run_robust_evaluation(GRAPH, tmp_path / "two", HASH, split_seeds=(42,), model_seeds=(42,), maximum_epochs=1, patience=1, include_cold_start=False)
    one = json.loads((first / "experiment_manifest.json").read_text())
    two = json.loads((second / "experiment_manifest.json").read_text())
    assert one["splitRecords"] == two["splitRecords"]
    rows = json.loads((first / "failure_analysis.json").read_text())
    assert rows and all(row["predictionProvenanceLabel"] == "MODEL_PREDICTION" for row in rows)
    assert any(candidate["candidateState"] == "UNOBSERVED_CANDIDATE" for row in rows for candidate in row["topPredictedCandidates"])


def test_paired_baseline_comparison_uses_identical_test_pairs(tmp_path):
    output = run_robust_evaluation(GRAPH, tmp_path / "run", HASH, split_seeds=(42,), model_seeds=(42,), maximum_epochs=1, patience=1, include_cold_start=False)
    runs = json.loads((output / "per_run_metrics.json").read_text())
    comparison = json.loads((output / "baseline_comparison.json").read_text())
    dataset = V4LinkPredictionDataset.load(GRAPH, HASH)
    split = dataset.split("per_drug_stratified", 42)
    assert runs[0]["ranking"]["caseCount"] == len(split.test)
    assert comparison["runs"][0]["splitSeed"] == runs[0]["splitSeed"]
