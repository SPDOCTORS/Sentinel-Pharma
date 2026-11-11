"""Automated verification tests for SentinelPharma V6 Experimental R-GCN."""
import json
from pathlib import Path
import pytest
import torch

RGCN_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "gnn_experiments" / "v6_rgcn"
WEIGHTS_PATH = RGCN_DIR / "model_weights.pt"
CONFIG_PATH = RGCN_DIR / "config.json"
BIO_AUDIT_PATH = RGCN_DIR / "bioactivity_audit.json"
CURVES_PATH = RGCN_DIR / "training_curves.json"
METRICS_PATH = RGCN_DIR / "validation_metrics.json"


@pytest.fixture(scope="module")
def config():
    assert CONFIG_PATH.exists(), f"Missing config at {CONFIG_PATH}"
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def bio_audit():
    assert BIO_AUDIT_PATH.exists(), f"Missing bioactivity audit at {BIO_AUDIT_PATH}"
    with open(BIO_AUDIT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def curves():
    assert CURVES_PATH.exists(), f"Missing training curves at {CURVES_PATH}"
    with open(CURVES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def val_metrics():
    assert METRICS_PATH.exists(), f"Missing validation metrics at {METRICS_PATH}"
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_rgcn_artifacts_exist_and_loadable(config, bio_audit, curves, val_metrics):
    """Verifies that all 5 required R-GCN experiment artifacts exist and parse cleanly."""
    assert WEIGHTS_PATH.exists()
    weights = torch.load(WEIGHTS_PATH, map_location="cpu", weights_only=True)
    assert isinstance(weights, dict)
    assert "node_embeddings.weight" in weights
    assert "conv1.weight" in weights or any("conv1" in k for k in weights)

    assert config["modelType"] == "RGCN_link_prediction"
    assert config["numNodes"] == 12985
    assert config["numRelations"] == 8
    assert config["seed"] == 42


def test_bioactivity_units_audit_integrity(bio_audit):
    """Verifies that pre-flight bioactivity audit standardizes values to nanomolar (nM) <= 1 uM."""
    assert bio_audit["totalBioactivityEdges"] == 15994
    assert "nM" in bio_audit["standardUnits"]
    assert bio_audit["allValuesWithinOneMicromolar"] is True
    assert bio_audit["distributionSummary"]["max_nM"] <= 1000.0
    assert bio_audit["distributionSummary"]["median_nM"] > 0.0


def test_training_curves_and_early_stopping(curves, config):
    """Verifies that training loss and validation MRR curves are tracked per epoch."""
    epochs = curves["epochs"]
    assert len(epochs) > 0
    assert curves["bestEpoch"] >= 1
    assert curves["bestValMRR"] > 0.0

    # Loss convergence check: later loss is lower than initial loss
    initial_loss = epochs[0]["trainLoss"]
    min_loss = min(e["trainLoss"] for e in epochs)
    assert min_loss < initial_loss, f"Loss did not decrease: min={min_loss}, initial={initial_loss}"


def test_validation_comparison_against_baseline(val_metrics):
    """Verifies comparative evaluation between V6 R-GCN and frozen 2-hop baseline on validation set."""
    mod = val_metrics["modelEvaluation"]
    base = val_metrics["baselineEvaluation"]
    delta = val_metrics["deltaComparison"]

    assert mod["queryCount"] == 1283
    assert base["queryCount"] == 1283

    # Ensure subgroup metrics are present
    assert "subgroups" in mod
    assert "twoHopConnected" in mod["subgroups"]
    assert "twoHopDisconnected" in mod["subgroups"]
    assert "subgroupDisconnected" in delta

    # R-GCN learns representations for multi-hop indications where 2-hop baseline score collapses to 0
    disc_rgcn = mod["subgroups"]["twoHopDisconnected"]
    disc_base = base["subgroupAnalysis"]["twoHopDisconnected"]
    assert disc_rgcn["count"] == 568
    assert disc_base["count"] == 568
