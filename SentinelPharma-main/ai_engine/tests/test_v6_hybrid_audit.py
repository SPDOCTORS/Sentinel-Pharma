"""Unit and regression tests for SentinelPharma V6 Hybrid Ranking Audit."""
import json
from pathlib import Path
import pytest
import numpy as np

from app.services.gnn.v6_hybrid_audit_service import (
    AUDIT_HYBRID_OUTPUT_DIR,
    audit_oof_fold_independence_and_label_exclusion,
    compute_paired_bootstrap_differences,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_oof_folds_independence_and_no_leakage():
    with open(DEFAULT_EXPERIMENT_DIR / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)

    train_pairs = splits["train"]
    fold_audit = audit_oof_fold_independence_and_label_exclusion(train_pairs, n_folds=5)

    assert fold_audit["numFolds"] == 5
    assert fold_audit["totalTrainPairs"] == 10079
    assert fold_audit["totalPairwiseLeaks"] == 0
    assert fold_audit["isStrictlyMutuallyExclusive"] is True

    for f_info in fold_audit["foldBreakdown"]:
        assert f_info["pairwiseOverlap"] == 0
        assert f_info["isMutuallyExclusive"] is True


def test_v6_paired_bootstrap_synthetic_calculation():
    np.random.seed(42)
    n_q = 50
    rr_a = [1.0 / (i % 5 + 1) for i in range(n_q)]
    rr_b = [1.0 / (i % 5 + 2) for i in range(n_q)]
    h10_a = [1 if r >= 0.1 else 0 for r in rr_a]
    h10_b = [1 if r >= 0.1 else 0 for r in rr_b]

    scores_a = np.random.rand(n_q, 10).tolist()
    scores_b = np.random.rand(n_q, 10).tolist()
    y_trues = np.zeros((n_q, 10), dtype=int)
    y_trues[:, 0] = 1

    res = compute_paired_bootstrap_differences(
        rr_a=rr_a,
        rr_b=rr_b,
        h10_a=h10_a,
        h10_b=h10_b,
        scores_a=scores_a,
        scores_b=scores_b,
        y_trues=y_trues.tolist(),
        n_bootstraps=100,
        seed=42,
    )

    for metric in ["deltaMRR", "deltaHitsAt10Percent", "deltaAUPRC"]:
        assert metric in res
        m_dict = res[metric]
        assert m_dict["ci_lower"] <= m_dict["mean"] <= m_dict["ci_upper"]
        assert 0.0 <= m_dict["p_value"] <= 1.0


def test_v6_hybrid_audit_report_and_statistical_verdict():
    audit_file = AUDIT_HYBRID_OUTPUT_DIR / "hybrid_ranking_audit.json"
    assert audit_file.exists(), f"Audit file not found at {audit_file}"

    with open(audit_file, "r", encoding="utf-8") as f:
        audit = json.load(f)

    # 1. Combiner normalization and leakage
    leakage = audit["leakageAndNormalizationAudit"]
    assert leakage["validationLabelsInCombinerTraining"] is False
    assert leakage["testLabelsInCombinerTraining"] is False
    assert leakage["scalerFittedStrictlyOnTrainingOOF"] is True
    assert leakage["zeroDivisionRisk"] is False
    assert leakage["normalizationSafe"] is True

    # 2. Paired bootstrap metrics
    p_boot = audit["pairedBootstrapAudit"]
    overall = p_boot["overall"]
    disconn = p_boot["twoHopDisconnected"]

    # Overall MRR difference spans 0 (not statistically significant)
    assert overall["deltaMRR"]["ci_lower"] <= 0.0 <= overall["deltaMRR"]["ci_upper"]
    assert overall["deltaMRR"]["statisticallySignificant"] is False
    assert overall["deltaHitsAt10Percent"]["statisticallySignificant"] is False

    # Disconnected MRR difference is strictly positive and statistically significant
    assert disconn["deltaMRR"]["ci_lower"] > 0.0
    assert disconn["deltaMRR"]["statisticallySignificant"] is True
    assert disconn["deltaHitsAt10Percent"]["ci_lower"] > 0.0
    assert disconn["deltaHitsAt10Percent"]["statisticallySignificant"] is True

    # 3. Verdict summary
    verdict = audit["statisticalBenefitVerdict"]
    assert verdict["overallIncrementalBenefitMRR"] is False
    assert verdict["disconnectedIncrementalBenefitMRR"] is True


def test_v6_frozen_graph_integrity_and_no_test_evaluation():
    with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    assert graph["datasetHash"] == FROZEN_DATASET_HASH

    audit_file = AUDIT_HYBRID_OUTPUT_DIR / "hybrid_ranking_audit.json"
    with open(audit_file, "r", encoding="utf-8") as f:
        audit = json.load(f)

    assert audit["validationQueryCount"] == 1283
    assert "testQueries" not in audit
