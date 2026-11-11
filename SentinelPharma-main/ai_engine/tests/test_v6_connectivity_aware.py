"""Unit and regression tests for SentinelPharma V6 Connectivity-Aware Hybrid Ranker."""
import json
from pathlib import Path
import pytest
import numpy as np
import torch

from app.services.gnn.v6_connectivity_aware_service import (
    CONN_AWARE_OUTPUT_DIR,
    build_connectivity_aware_features,
    verify_score_continuity,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)
from app.services.gnn.v6_hybrid_ranking_service import (
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
)

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_connectivity_feature_expansion_values_and_continuity():
    """Verify feature expansion structure and zero interaction when s_2 = 0."""
    # Synthetic pairs:
    # Pair 0: Disconnected (s_2 = 0.0, pop = 45.0, rgcn = 0.65)
    # Pair 1: Connected (s_2 = 2.5, pop = 10.0, rgcn = 0.80)
    raw = np.array([
        [0.0, 45.0, 0.65],
        [2.5, 10.0, 0.80],
    ], dtype=np.float32)

    expanded = build_connectivity_aware_features(raw)
    assert expanded.shape == (2, 4)

    # Disconnected candidate must have interaction term strictly 0.0
    assert expanded[0, 0] == 0.0
    assert expanded[0, 1] == 45.0
    assert expanded[0, 2] == 0.65
    assert expanded[0, 3] == 0.0

    # Connected candidate has interaction = s_2 * s_rgcn
    assert expanded[1, 0] == 2.5
    assert expanded[1, 1] == 10.0
    assert expanded[1, 2] == 0.80
    assert np.isclose(expanded[1, 3], 2.5 * 0.80)


def test_v6_score_continuity_across_connectivity_boundary():
    """Verify that score jump across s_2 -> 0+ boundary is bounded and continuous."""
    # Load scaler and weights from the experiment artifact
    metric_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    assert metric_file.exists(), "connectivity_aware_metrics.json must exist."

    with open(metric_file, "r", encoding="utf-8") as f:
        doc = json.load(f)

    scaler_dict = doc["featureScaler"]
    scaler = TrainingFeatureScaler()
    scaler.mean = np.array(scaler_dict["mean"], dtype=np.float32)
    scaler.std = np.array(scaler_dict["std"], dtype=np.float32)

    ranker_dict = doc["combinerWeights"]
    ranker = RegularizedLogisticRanker(num_features=4, l2_penalty=ranker_dict["l2_penalty"])
    ranker.linear.weight.data = torch.tensor([ranker_dict["weights"]], dtype=torch.float32)
    ranker.linear.bias.data = torch.tensor([ranker_dict["bias"]], dtype=torch.float32)

    audit = verify_score_continuity(ranker, scaler, test_rgcn=0.5, test_pop=50.0, epsilon=1e-5)
    assert audit["isContinuous"] is True
    assert audit["absoluteDifference"] < 1e-4


def test_v6_cross_group_ranking_consistency():
    """Verify consistent sorting in mixed pools without artificial cliffs or ranking inversions."""
    metric_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    with open(metric_file, "r", encoding="utf-8") as f:
        doc = json.load(f)

    scaler_dict = doc["featureScaler"]
    scaler = TrainingFeatureScaler()
    scaler.mean = np.array(scaler_dict["mean"], dtype=np.float32)
    scaler.std = np.array(scaler_dict["std"], dtype=np.float32)

    ranker_dict = doc["combinerWeights"]
    ranker = RegularizedLogisticRanker(num_features=4, l2_penalty=ranker_dict["l2_penalty"])
    ranker.linear.weight.data = torch.tensor([ranker_dict["weights"]], dtype=torch.float32)
    ranker.linear.bias.data = torch.tensor([ranker_dict["bias"]], dtype=torch.float32)

    # Mixed pool with both connected and disconnected candidates
    # Cand A: Disconnected with high popularity and high R-GCN
    # Cand B: Weak connected with tiny s_2
    # Cand C: Strong connected with large s_2
    raw_mixed = np.array([
        [0.0, 150.0, 0.85],
        [0.05, 10.0, 0.40],
        [3.0, 20.0, 0.90],
    ], dtype=np.float32)

    exp_mixed = build_connectivity_aware_features(raw_mixed)
    norm_mixed = scaler.transform(exp_mixed)
    scores = ranker.predict_logits(norm_mixed)

    # Verify scores are finite real numbers
    assert len(scores) == 3
    assert np.all(np.isfinite(scores))

    # Cand C (strong direct 2-hop + high R-GCN) should rank highest
    assert scores[2] > scores[0]
    assert scores[2] > scores[1]


def test_v6_no_test_set_evaluation():
    """Verify that test set was strictly NEVER evaluated and frozen graph hash is unaltered."""
    metric_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    with open(metric_file, "r", encoding="utf-8") as f:
        doc = json.load(f)

    assert doc["frozenGraphDatasetHash"] == FROZEN_DATASET_HASH
    assert doc["validationQueryCount"] == 1283
    assert doc["leakageAndIsolationAudit"]["evaluatedOnTestSet"] is False
    assert doc["leakageAndIsolationAudit"]["heldOutValidationLabelsUsedForFitting"] is False
    assert doc["leakageAndIsolationAudit"]["featureScalerFittedStrictlyOnOOF"] is True


def test_v6_paired_bootstrap_confidence_intervals():
    """Verify that paired bootstrap differences are properly bounded and significant."""
    metric_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    with open(metric_file, "r", encoding="utf-8") as f:
        doc = json.load(f)

    boot = doc["pairedBootstrapConfidenceIntervals"]

    # 1. Overall vs Static Full: Delta MRR must be positive and statistically significant
    ov_stat_mrr = boot["overall"]["connectivityAwareVsStaticFull"]["deltaMRR"]
    assert ov_stat_mrr["ci_lower"] <= ov_stat_mrr["mean"] <= ov_stat_mrr["ci_upper"]
    assert ov_stat_mrr["mean"] > 0
    assert ov_stat_mrr["statisticallySignificant"] is True

    # 2. Overall vs 2-Hop + Pop: Delta MRR must be positive and statistically significant
    ov_base_mrr = boot["overall"]["connectivityAwareVsTwoHopPlusPopularity"]["deltaMRR"]
    assert ov_base_mrr["ci_lower"] <= ov_base_mrr["mean"] <= ov_base_mrr["ci_upper"]
    assert ov_base_mrr["mean"] > 0
    assert ov_base_mrr["statisticallySignificant"] is True

    # 3. Connected vs Static Full: Delta MRR and Delta Hits@10 must be positive and significant
    conn_stat_mrr = boot["subgroups"]["twoHopConnected"]["connectivityAwareVsStaticFull"]["deltaMRR"]
    conn_stat_h10 = boot["subgroups"]["twoHopConnected"]["connectivityAwareVsStaticFull"]["deltaHitsAt10Percent"]
    assert conn_stat_mrr["statisticallySignificant"] is True
    assert conn_stat_mrr["mean"] > 0.02
    assert conn_stat_h10["statisticallySignificant"] is True
    assert conn_stat_h10["mean"] > 2.0


def test_v6_three_seed_stability():
    """Verify 3-seed stability and check that mean MRR is superior to static full baseline."""
    metric_file = CONN_AWARE_OUTPUT_DIR / "connectivity_aware_metrics.json"
    with open(metric_file, "r", encoding="utf-8") as f:
        doc = json.load(f)

    var = doc["threeSeedVariability"]
    assert len(var["overall"]["mrr"]["values"]) == 3
    assert var["overall"]["mrr"]["mean"] > 0.37
    assert var["overall"]["mrr"]["std"] < 0.01
    assert var["twoHopConnected"]["mrr"]["mean"] > 0.52
    assert var["twoHopDisconnected"]["mrr"]["mean"] > 0.18
