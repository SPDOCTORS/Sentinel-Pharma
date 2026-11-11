"""Unit and regression tests for SentinelPharma V6 Hybrid Ranking Experiment."""
import json
from pathlib import Path
import pytest
import numpy as np

from app.services.gnn.v6_hybrid_ranking_service import (
    HYBRID_OUTPUT_DIR,
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_training_feature_scaler():
    X = np.array([[1.0, 10.0, 0.5], [3.0, 30.0, 0.9], [5.0, 50.0, 0.1]], dtype=np.float32)
    scaler = TrainingFeatureScaler()
    scaler.fit(X)

    assert np.allclose(scaler.mean, [3.0, 30.0, 0.5])
    X_norm = scaler.transform(X)
    assert np.allclose(np.mean(X_norm, axis=0), [0.0, 0.0, 0.0], atol=1e-5)
    assert np.allclose(np.std(X_norm, axis=0), [1.0, 1.0, 1.0], atol=1e-5)


def test_v6_regularized_logistic_ranker_fit():
    np.random.seed(42)
    X = np.random.randn(100, 3).astype(np.float32)
    y = (X[:, 0] * 0.8 + X[:, 1] * 0.5 > 0).astype(np.int32)

    ranker = RegularizedLogisticRanker(num_features=3, l2_penalty=0.05, lr=0.1, epochs=50)
    ranker.fit(X, y)

    w_dict = ranker.get_weights()
    assert len(w_dict["weights"]) == 3
    assert all(np.isfinite(w) for w in w_dict["weights"])
    assert np.isfinite(w_dict["bias"])

    logits = ranker.predict_logits(X)
    assert logits.shape == (100,)


def test_v6_hybrid_artifacts_and_frozen_graph_integrity():
    metrics_file = HYBRID_OUTPUT_DIR / "hybrid_ranking_metrics.json"
    assert metrics_file.exists(), f"Hybrid metrics file not found at {metrics_file}"

    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    assert metrics["validationQueryCount"] == 1283
    assert "testQueries" not in metrics

    # Frozen graph integrity
    with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    assert graph["datasetHash"] == FROZEN_DATASET_HASH


def test_v6_hybrid_performance_gain_over_baselines():
    metrics_file = HYBRID_OUTPUT_DIR / "hybrid_ranking_metrics.json"
    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    three_seed = metrics["threeSeedVariability"]
    overall = three_seed["overall"]
    conn = three_seed["twoHopConnected"]
    disconn = three_seed["twoHopDisconnected"]

    # Hybrid MRR must exceed all individual baselines on the hard candidate pool
    # Individual baselines on hard pool: 2-hop (0.3456), Pop (0.2428), Hard R-GCN (0.2034)
    assert overall["mrr"]["mean"] > 0.35
    assert overall["hitsAt10Percent"]["mean"] > 60.0  # Big jump over individual baselines (52.3%, 46.2%, 31.2%)
    assert overall["auprc"]["mean"] > 0.08

    # Connected vs Disconnected subgroup properties
    assert conn["mrr"]["mean"] > disconn["mrr"]["mean"]
    assert conn["mrr"]["mean"] > 0.45
    assert conn["hitsAt10Percent"]["mean"] > 80.0

    # Multi-hop recovery: Disconnected subgroup Hits@10 must be drastically higher than 2-hop alone (5.99%)
    assert disconn["hitsAt10Percent"]["mean"] > 35.0  # ~37.85% vs 5.99% for 2-hop baseline alone


def test_v6_feature_ablations_completeness():
    metrics_file = HYBRID_OUTPUT_DIR / "hybrid_ranking_metrics.json"
    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    ablations = metrics["featureAblations"]
    expected_ablations = [
        "full_hybrid",
        "ablation_no_popularity",
        "ablation_no_rgcn",
        "ablation_no_two_hop",
        "single_two_hop",
        "single_popularity",
        "single_rgcn",
    ]

    for key in expected_ablations:
        assert key in ablations
        res = ablations[key]
        assert "mrr" in res
        assert "hitsAt10Percent" in res
        assert "auprc" in res
        assert "subgroups" in res
