"""Automated verification tests for SentinelPharma V6 GNN Experimentation & Baseline."""
import json
from pathlib import Path
import pytest

EXPERIMENT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "gnn_experiments" / "v6_baseline"
MANIFEST_PATH = EXPERIMENT_DIR / "split_manifest.json"
SPLITS_PATH = EXPERIMENT_DIR / "splits.json"
POOLS_PATH = EXPERIMENT_DIR / "candidate_ranking_pool.json"
METRICS_PATH = EXPERIMENT_DIR / "baseline_metrics.json"


@pytest.fixture(scope="module")
def manifest():
    assert MANIFEST_PATH.exists(), f"Missing split manifest at {MANIFEST_PATH}"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def splits():
    assert SPLITS_PATH.exists(), f"Missing splits at {SPLITS_PATH}"
    with open(SPLITS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def pools():
    assert POOLS_PATH.exists(), f"Missing candidate pools at {POOLS_PATH}"
    with open(POOLS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def metrics():
    assert METRICS_PATH.exists(), f"Missing baseline metrics at {METRICS_PATH}"
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_split_manifest_and_zero_leakage(manifest, splits):
    """Verifies split manifest properties and strict zero-leakage invariant."""
    assert manifest["experimentVersion"] == "v6-gnn-baseline-experiment-v1"
    assert manifest["seed"] == 42

    leakage = manifest["splitConfig"]["leakageCheck"]
    assert leakage["pairwiseOverlap"] == 0
    assert leakage["ontologyHierarchyLeakage"] == 0
    assert leakage["isLeakageFree"] is True

    # Re-verify disjointness directly from splits.json
    train_set = {(p["drug"], p["disease"]) for p in splits["train"]}
    val_set = {(p["drug"], p["disease"]) for p in splits["val"]}
    test_set = {(p["drug"], p["disease"]) for p in splits["test"]}

    assert len(train_set & val_set) == 0
    assert len(train_set & test_set) == 0
    assert len(val_set & test_set) == 0
    assert len(train_set) + len(val_set) + len(test_set) == 12612


def test_split_proportions(splits):
    """Verifies that split proportions adhere to 80/10/10 target within 1% tolerance."""
    total = len(splits["train"]) + len(splits["val"]) + len(splits["test"])
    assert total == 12612

    train_pct = len(splits["train"]) / total * 100
    val_pct = len(splits["val"]) / total * 100
    test_pct = len(splits["test"]) / total * 100

    assert 78.5 <= train_pct <= 81.5, f"Train percent {train_pct}% out of expected ~80%"
    assert 9.0 <= val_pct <= 11.5, f"Val percent {val_pct}% out of expected ~10%"
    assert 9.0 <= test_pct <= 11.5, f"Test percent {test_pct}% out of expected ~10%"


def test_candidate_ranking_pool_format_and_filtration(pools):
    """Verifies candidate pool structure and candidate filtering."""
    test_queries = pools["testQueries"]
    assert len(test_queries) > 1000

    for query in test_queries[:50]:
        assert query["positiveDisease"].startswith("EFO:") or query["positiveDisease"].startswith("MONDO:") or query["positiveDisease"].startswith("DOID:") or query["positiveDisease"].startswith("HP:") or query["positiveDisease"].startswith("Orphanet:") or query["positiveDisease"].startswith("OTAR:")
        assert len(query["candidatePool"]) == 100
        # Positive is at index 0 in candidate pool
        assert query["candidatePool"][0] == query["positiveDisease"]
        # All candidates in pool are distinct
        assert len(set(query["candidatePool"])) == 100


def test_baseline_metrics_performance_and_coverage(metrics):
    """Verifies baseline 2-hop ranking metrics, coverage, and subgroup behavior."""
    assert metrics["baselineName"] == "two_hop_shared_target_affinity_weighted"
    m = metrics["metrics"]

    # Coverage should match the 2-hop path connectivity (~57-58%)
    assert 55.0 <= m["coveragePercent"] <= 60.0

    # Ranking metrics
    rk = m["rankingMetrics"]
    assert rk["mrr"] > 0.15, f"MRR {rk['mrr']} lower than expected"
    assert rk["hitsAt10Percent"] > 25.0, f"Hits@10 {rk['hitsAt10Percent']}% lower than expected"
    assert rk["hitsAt1Percent"] > 5.0, f"Hits@1 {rk['hitsAt1Percent']}% lower than expected"

    # Classification metrics
    cl = m["classificationMetrics"]
    assert cl["auprc"] > 0.05, f"AUPRC {cl['auprc']} not significantly above random baseline (0.01)"
    assert cl["auroc"] > 0.70, f"AUROC {cl['auroc']} lower than expected"

    # Subgroup divergence: 2-hop connected pairs should significantly outperform disconnected pairs
    sg = m["subgroupAnalysis"]
    assert sg["twoHopConnected"]["mrr"] > sg["twoHopDisconnected"]["mrr"] * 10
    assert sg["twoHopConnected"]["hitsAt10Percent"] > sg["twoHopDisconnected"]["hitsAt10Percent"] * 5
