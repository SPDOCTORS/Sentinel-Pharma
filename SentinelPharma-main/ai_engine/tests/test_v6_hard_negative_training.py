"""Unit and regression tests for SentinelPharma V6 Hard-Negative R-GCN Training Experiment."""
import json
from pathlib import Path
import pytest
import torch

from app.services.gnn.v6_hard_negative_training_service import (
    HARD_TRAIN_OUTPUT_DIR,
    V6TrainingHardNegativeSampler,
)
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
)
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6TensorGraph,
)

FROZEN_DATASET_HASH = "c93208a8c2eff6012c6b84c0107de9f9f7f1243c33977a62c152661642826956"


def test_v6_training_hard_negative_sampler_integrity():
    with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(DEFAULT_EXPERIMENT_DIR / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)

    train_pairs = splits["train"]
    tensor_graph = V6TensorGraph(graph["entities"], graph["relations"])

    # Synthetic empty ontology DAG for fast unit check
    sampler = V6TrainingHardNegativeSampler(
        train_pairs=train_pairs[:100],
        entities=graph["entities"],
        disease_therapeutic_areas={},
        disease_ancestors={},
        disease_descendants={},
        tensor_graph=tensor_graph,
    )

    assert len(sampler.pair_negative_node_indices) == 100
    for idx_list in sampler.pair_negative_node_indices:
        assert len(idx_list) > 0


def test_v6_checkpoint_preservation_and_frozen_graph_integrity():
    # 1. Existing original R-GCN checkpoint must be preserved
    orig_ckpt = OUTPUT_RGCN_DIR / "model_weights.pt"
    assert orig_ckpt.exists(), "Original R-GCN weights must not be modified or deleted"
    assert orig_ckpt.stat().st_size > 1_000_000

    # 2. Frozen graph dataset hash must remain identical
    with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    assert graph["datasetHash"] == FROZEN_DATASET_HASH

    # 3. New hard-negative training weights must exist for all 3 seeds
    for seed in [42, 43, 44]:
        seed_ckpt = HARD_TRAIN_OUTPUT_DIR / f"model_weights_seed_{seed}.pt"
        assert seed_ckpt.exists(), f"Checkpoint for seed {seed} missing"
        assert seed_ckpt.stat().st_size > 1_000_000

    best_ckpt = HARD_TRAIN_OUTPUT_DIR / "best_model_weights.pt"
    assert best_ckpt.exists()


def test_v6_multi_seed_metrics_and_subgroup_coverage():
    metrics_file = HARD_TRAIN_OUTPUT_DIR / "hard_negative_training_metrics.json"
    assert metrics_file.exists()

    with open(metrics_file, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    assert metrics["validationQueryCount"] == 1283
    assert "testQueries" not in metrics

    multi_seed = metrics["multiSeedSummary"]
    assert multi_seed["seeds"] == [42, 43, 44]

    hard_pool_summary = multi_seed["hardCandidatePool"]
    assert "overall" in hard_pool_summary
    assert "twoHopConnected" in hard_pool_summary
    assert "twoHopDisconnected" in hard_pool_summary

    # Overall metrics verification
    overall = hard_pool_summary["overall"]
    assert overall["mrr"]["mean"] > 0.15  # Outperforms original R-GCN (0.1327)
    assert overall["hitsAt10Percent"]["mean"] > 30.0
    assert overall["auprc"]["mean"] > 0.03

    # Subgroup metrics verification
    conn = hard_pool_summary["twoHopConnected"]
    disconn = hard_pool_summary["twoHopDisconnected"]

    assert conn["mrr"]["mean"] > 0.16
    assert disconn["mrr"]["mean"] > 0.13

    # Connected subgroup must have higher MRR than disconnected
    assert conn["mrr"]["mean"] >= disconn["mrr"]["mean"]

    # Comparative baselines present
    comp = metrics["comparativeBaselines"]["hardCandidatePool"]
    assert "hard_negative_rgcn_mean" in comp
    assert "original_rgcn" in comp
    assert "two_hop_baseline" in comp
    assert "disease_popularity" in comp
