"""Automated verification tests for SentinelPharma V6 R-GCN Model Audit."""
import json
from pathlib import Path
import pytest

AUDIT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "gnn_experiments" / "v6_rgcn_audit"
AUDIT_FILE = AUDIT_DIR / "rgcn_model_audit.json"
ORIGINAL_WEIGHTS_FILE = Path(__file__).resolve().parents[1] / "artifacts" / "gnn_experiments" / "v6_rgcn" / "model_weights.pt"


@pytest.fixture(scope="module")
def audit_data():
    assert AUDIT_FILE.exists(), f"Audit report missing at {AUDIT_FILE}"
    with open(AUDIT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def test_audit_report_schema_and_integrity(audit_data):
    """Verifies that the R-GCN model audit report exists with complete benchmark sections."""
    assert audit_data["auditVersion"] == "v6-rgcn-post-training-audit-v1"
    assert "frozenGraphDatasetHash" in audit_data
    assert audit_data["validationQueryCount"] == 1283
    assert audit_data["candidatePoolSize"] == 100

    bench = audit_data["comparativeBenchmark"]
    assert "v6_rgcn_full" in bench
    assert "two_hop_baseline" in bench
    assert "disease_popularity_control" in bench
    assert "shuffled_drug_label_control" in bench
    assert "pathway_edge_ablation" in bench


def test_control_benchmarks_and_subgroup_behavior(audit_data):
    """Verifies disease-popularity and shuffled-drug-label control metrics."""
    bench = audit_data["comparativeBenchmark"]
    pop = bench["disease_popularity_control"]
    shuffled = bench["shuffled_drug_label_control"]

    assert pop["mrr"] > 0.0
    assert pop["hitsAt10Percent"] > 0.0
    assert "subgroups" in pop
    assert "twoHopConnected" in pop["subgroups"]
    assert "twoHopDisconnected" in pop["subgroups"]

    assert shuffled["mrr"] > 0.0
    assert shuffled["hitsAt10Percent"] > 0.0
    assert "subgroups" in shuffled


def test_reactome_pathway_ablation_quantification(audit_data):
    """Verifies that Reactome pathway contribution is quantified across overall and disconnected queries."""
    contrib = audit_data["pathwayContributionAnalysis"]
    assert "overall_mrr_delta" in contrib
    assert "twoHopDisconnected_mrr_delta" in contrib
    assert "twoHopDisconnected_hitsAt10_delta" in contrib

    ablation = audit_data["comparativeBenchmark"]["pathway_edge_ablation"]
    assert ablation["ablatedEdgesRemoved"] == 31860  # 15,930 forward + 15,930 reverse
    assert ablation["remainingDirectedEdges"] > 0


def test_technical_documentation_completeness(audit_data):
    """Verifies complete technical documentation of initialization, decoder, and transductive bounds."""
    doc = audit_data["technicalDocumentation"]
    assert "nodeFeatureInitialization" in doc
    assert "decoderBehavior" in doc
    assert "transductiveLimitations" in doc

    assert len(doc["nodeFeatureInitialization"]["recommendedUpgrade"]) > 20
    assert len(doc["decoderBehavior"]["calibrationAnalysis"]) > 20
    assert len(doc["transductiveLimitations"]["pathwayToInductiveGeneralization"]) > 20


def test_preservation_of_best_checkpoint():
    """Verifies that the original trained R-GCN checkpoint remains preserved and non-corrupted."""
    assert ORIGINAL_WEIGHTS_FILE.exists()
    assert ORIGINAL_WEIGHTS_FILE.stat().st_size > 1024 * 1024  # > 1 MB
