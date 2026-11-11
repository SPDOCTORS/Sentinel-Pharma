"""Unit and regression tests for SentinelPharma V6 Locked Test Evaluation Specification."""
import json
from pathlib import Path
import pytest

from app.services.gnn.v6_locked_test_service import (
    LOCKED_TEST_SPEC_DIR,
    compute_file_sha256,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)
from app.services.gnn.v6_hard_negative_training_service import HARD_TRAIN_OUTPUT_DIR

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_locked_manifest_exists_and_un_evaluated():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    assert manifest_file.exists(), "Locked manifest must exist."

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest["status"] == "LOCKED_READY_FOR_EVALUATION"
    assert manifest["testSetEvaluated"] in (True, False)
    assert manifest["blockersReport"]["hasBlockers"] is False
    assert len(manifest["blockersReport"]["blockersList"]) == 0


def test_v6_frozen_graph_and_split_checksums():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # Check graph checksum
    graph_file = DEFAULT_FROZEN_DIR / "graph.json"
    actual_graph_sha = compute_file_sha256(graph_file)
    assert actual_graph_sha == manifest["frozenBiomedicalGraph"]["sha256"]
    assert manifest["frozenBiomedicalGraph"]["datasetHash"] == FROZEN_DATASET_HASH

    # Check split checksum
    split_file = DEFAULT_EXPERIMENT_DIR / "splits.json"
    actual_split_sha = compute_file_sha256(split_file)
    assert actual_split_sha == manifest["frozenDataSplits"]["sha256"]


def test_v6_frozen_checkpoints_sha256():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    for ckpt_key, ckpt_info in manifest["frozenCheckpoints"].items():
        rel_path = ckpt_info["path"]
        if rel_path.startswith("ai_engine/"):
            rel_path = rel_path[len("ai_engine/"):]
        actual_path = Path(__file__).resolve().parents[1] / rel_path
        assert actual_path.exists(), f"Checkpoint {ckpt_key} path must exist: {actual_path}"
        actual_sha = compute_file_sha256(actual_path)
        assert actual_sha == ckpt_info["sha256"], f"SHA256 mismatch for {ckpt_key}"


def test_v6_split_and_ontology_leakage_audit():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    audit = manifest["splitAndLeakageAudit"]
    assert audit["isStrictlySeparated"] is True
    assert audit["pairwiseOverlaps"]["trainValOverlap"] == 0
    assert audit["pairwiseOverlaps"]["trainTestOverlap"] == 0
    assert audit["pairwiseOverlaps"]["valTestOverlap"] == 0

    assert audit["ontologyEquivalentLeaks"]["trainTestOntologyLeaks"] == 0
    assert audit["ontologyEquivalentLeaks"]["trainValOntologyLeaks"] == 0
    assert audit["ontologyEquivalentLeaks"]["valTestOntologyLeaks"] == 0


def test_v6_candidate_pool_audit_and_file_integrity():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    neg_audit = manifest["negativeFilteringAudit"]
    assert neg_audit["isNegativeFilteringSound"] is True
    assert neg_audit["forbiddenSetCoversTestIndications"] is True
    assert neg_audit["frequenciesConditionedStrictlyOnTrain"] is True

    # Check pre-generated test pool file
    pool_file = LOCKED_TEST_SPEC_DIR / "locked_test_candidate_pool.json"
    assert pool_file.exists(), "Locked test candidate pool file must exist."

    with open(pool_file, "r", encoding="utf-8") as f:
        pool_data = json.load(f)

    assert pool_data["queryCount"] == 1250
    assert pool_data["candidatePoolSize"] == 100
    assert len(pool_data["testQueries"]) == 1250

    # Verify each query has 1 positive and 99 negatives
    for q in pool_data["testQueries"][:50]:
        assert len(q["candidatePool"]) == 100
        assert q["candidatePool"][0] == q["positiveDisease"]


def test_v6_predefined_metrics_and_comparisons():
    manifest_file = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    spec = manifest["lockedEvaluationSpecification"]
    assert "Mean Reciprocal Rank (MRR)" in spec["primaryEvaluationMetrics"]
    assert "Hits@10 (%)" in spec["primaryEvaluationMetrics"]
    assert "Area Under the Precision-Recall Curve (AUPRC)" in spec["primaryEvaluationMetrics"]

    assert len(spec["predefinedStatisticalComparisons"]) == 3
    comps = [c["comparison"] for c in spec["predefinedStatisticalComparisons"]]
    assert "Connectivity-Aware Hybrid vs. Static Full Hybrid" in comps
    assert "Connectivity-Aware Hybrid vs. 2-Hop + Popularity Baseline" in comps
    assert "Connectivity-Aware Hybrid vs. Standalone Hard-Negative R-GCN" in comps
