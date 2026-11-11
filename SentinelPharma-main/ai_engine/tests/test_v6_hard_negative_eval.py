"""Unit and regression tests for SentinelPharma V6 Hard Negative Evaluation."""
import json
from pathlib import Path
import pytest
import numpy as np

from app.services.gnn.v6_hard_negative_eval import (
    HARD_EVAL_OUTPUT_DIR,
    compute_bootstrap_confidence_intervals,
    compute_candidate_difficulty,
    get_disease_frequency_tier,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_frequency_tier_classification():
    assert get_disease_frequency_tier(0) == 0
    assert get_disease_frequency_tier(1) == 1
    assert get_disease_frequency_tier(4) == 1
    assert get_disease_frequency_tier(5) == 2
    assert get_disease_frequency_tier(19) == 2
    assert get_disease_frequency_tier(20) == 3
    assert get_disease_frequency_tier(500) == 3


def test_v6_bootstrap_confidence_intervals_synthetic():
    np.random.seed(42)
    n_q = 50
    reciprocal_ranks = [1.0 / (i % 5 + 1) for i in range(n_q)]
    hits_10 = [1 if rr >= 0.1 else 0 for rr in reciprocal_ranks]

    y_true = np.zeros((n_q, 20), dtype=int)
    y_true[:, 0] = 1
    y_scores = np.random.rand(n_q, 20).tolist()

    ci_res = compute_bootstrap_confidence_intervals(
        reciprocal_ranks=reciprocal_ranks,
        hits_10=hits_10,
        y_true_per_query=y_true.tolist(),
        y_scores_per_query=y_scores,
        n_bootstraps=200,
        confidence_level=0.95,
        seed=42,
    )

    for metric in ["mrr", "hitsAt10Percent", "auprc"]:
        assert metric in ci_res
        m_dict = ci_res[metric]
        assert m_dict["ci_lower"] <= m_dict["mean"] <= m_dict["ci_upper"]
        assert m_dict["std_err"] >= 0.0


def test_v6_hard_candidate_pool_properties():
    pool_file = HARD_EVAL_OUTPUT_DIR / "hard_candidate_ranking_pool.json"
    assert pool_file.exists(), f"Hard candidate pool file not found at {pool_file}"

    with open(pool_file, "r", encoding="utf-8") as f:
        pool_data = json.load(f)

    assert pool_data["queryCount"] == 1283
    assert pool_data["candidatePoolSize"] == 100
    assert pool_data["negativesPerQuery"] == 99

    queries = pool_data["valQueries"]
    assert len(queries) == 1283

    # Check first 50 queries for strict pool invariants
    for q in queries[:50]:
        assert len(q["candidatePool"]) == 100
        assert q["candidatePool"][0] == q["positiveDisease"]
        # Ensure 99 distinct negatives distinct from positive
        negs = q["candidatePool"][1:]
        assert len(set(negs)) == 99
        assert q["positiveDisease"] not in negs
        assert isinstance(q["isTwoHopConnected"], bool)


def test_v6_candidate_difficulty_metrics():
    metrics_file = HARD_EVAL_OUTPUT_DIR / "hard_evaluation_metrics.json"
    assert metrics_file.exists(), f"Metrics file not found at {metrics_file}"

    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)

    diff = metrics_data["candidateDifficulty"]
    u_pool = diff["uniformPool"]
    h_pool = diff["hardPool"]

    # Active candidate percent must be drastically higher in hard pool
    assert h_pool["activeCandidatePercent"] > 90.0
    assert u_pool["activeCandidatePercent"] < 25.0

    # Therapeutic area overlap must be substantially higher
    assert h_pool["meanTherapeuticAreaOverlapPercent"] > 50.0
    assert u_pool["meanTherapeuticAreaOverlapPercent"] < 25.0

    # Exact frequency tier match percent must be significantly higher
    assert h_pool["exactFrequencyTierMatchPercent"] > 50.0
    assert u_pool["exactFrequencyTierMatchPercent"] < 10.0

    # Mean frequency difference must be reduced
    assert h_pool["meanFrequencyDifference"] < u_pool["meanFrequencyDifference"]


def test_v6_comparative_benchmark_completeness():
    metrics_file = HARD_EVAL_OUTPUT_DIR / "hard_evaluation_metrics.json"
    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)

    bench = metrics_data["comparativeBenchmark"]
    assert "hardCandidatePool" in bench
    assert "uniformCandidatePool" in bench

    expected_models = [
        "v6_rgcn_frozen",
        "disease_popularity",
        "shuffled_label_control",
        "two_hop_baseline",
    ]

    for pool_key in ["hardCandidatePool", "uniformCandidatePool"]:
        pool_bench = bench[pool_key]
        for m_key in expected_models:
            assert m_key in pool_bench
            res = pool_bench[m_key]
            assert "mrr" in res
            assert "hitsAt10Percent" in res
            assert "auprc" in res
            assert "confidenceIntervals95" in res

            ci = res["confidenceIntervals95"]
            assert ci["mrr"]["ci_lower"] <= ci["mrr"]["mean"] <= ci["mrr"]["ci_upper"]
            assert ci["hitsAt10Percent"]["ci_lower"] <= ci["hitsAt10Percent"]["mean"] <= ci["hitsAt10Percent"]["ci_upper"]

            # Subgroup checks
            assert "subgroups" in res
            subgroups = res["subgroups"]
            assert "twoHopConnected" in subgroups
            assert "twoHopDisconnected" in subgroups
            assert subgroups["twoHopConnected"]["count"] == 715
            assert subgroups["twoHopDisconnected"]["count"] == 568

    # Verify that disease popularity prior collapses on hard negatives compared to uniform
    pop_hard_mrr = bench["hardCandidatePool"]["disease_popularity"]["mrr"]
    pop_uniform_mrr = bench["uniformCandidatePool"]["disease_popularity"]["mrr"]
    assert pop_hard_mrr < 0.35
    assert pop_uniform_mrr > 0.55


def test_v6_frozen_graph_integrity_and_no_test_leakage():
    # Verify graph hash was not mutated
    with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    assert graph["datasetHash"] == FROZEN_DATASET_HASH

    # Verify hard evaluation reports exactly 1,283 validation queries and zero test queries
    metrics_file = HARD_EVAL_OUTPUT_DIR / "hard_evaluation_metrics.json"
    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)
    assert metrics_data["validationQueryCount"] == 1283
    assert "testQueries" not in metrics_data
