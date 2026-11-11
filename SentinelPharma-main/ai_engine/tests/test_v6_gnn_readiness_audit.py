"""Automated verification tests for SentinelPharma V6 GNN Training Readiness Audit."""
import json
from pathlib import Path
import pytest

REPORT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "biomedical_graph" / "v6_production" / "v6_gnn_readiness_audit.json"


@pytest.fixture(scope="module")
def audit_report():
    assert REPORT_PATH.exists(), f"Audit report missing at {REPORT_PATH}"
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_audit_report_schema_and_version(audit_report):
    """Verifies that audit report has valid metadata and version."""
    assert audit_report["auditVersion"] == "v6-gnn-readiness-v1"
    assert "datasetHash" in audit_report
    assert len(audit_report["datasetHash"]) == 64


def test_connected_components_topology(audit_report):
    """Verifies that the graph is >99.9% connected within a single Giant Component."""
    cc = audit_report["connectedComponents"]
    assert cc["totalComponents"] == 4
    assert cc["largestComponentNodeCount"] == 12977
    assert cc["largestComponentNodePercent"] >= 99.9
    assert cc["smallComponentsCount"] == 3


def test_supervision_indication_coverage_and_phases(audit_report):
    """Verifies supervision indication counts, entity coverage, and clinical phase breakdown."""
    cov = audit_report["supervisionCoverage"]
    assert cov["totalSupervisionPairs"] == 12612
    assert cov["uniqueDrugsWithIndications"] == 3458
    assert cov["uniqueDiseasesWithIndications"] == 513

    # Exact clinical phase stratification
    pb = cov["phaseBreakdown"]
    total_phases = (
        pb["phase4_approved"]["count"]
        + pb["phase3"]["count"]
        + pb["phase2"]["count"]
        + pb["phase1"]["count"]
        + pb["phase0_early1"]["count"]
        + pb["preclinical_or_other"]["count"]
    )
    assert total_phases == 12612
    assert pb["phase4_approved"]["count"] == 2159


def test_ontology_hierarchy_and_redundancy(audit_report):
    """Verifies identification of hierarchically redundant parent-child disease indication annotations."""
    ont = audit_report["ontologyHierarchyAudit"]
    assert ont["hierarchicallyRedundantPairsCount"] == 3107
    assert ont["drugsWithRedundantLabelsCount"] == 702


def test_shortcut_leakage_and_multihop_requirement(audit_report):
    """Verifies the proportion of 2-hop target-shared shortcuts vs multi-hop pathway required indications."""
    sc = audit_report["shortcutLeakageAudit"]
    assert sc["pairsWithAny2Hop"] == 7254
    assert sc["pairsWithout2Hop"] == 5358
    assert sc["pairsWithAny2Hop"] + sc["pairsWithout2Hop"] == 12612
    # Confirms that >40% of indications require multi-hop GNN message passing
    assert sc["pairsWithout2HopPercent"] > 40.0


def test_split_proposals_and_leakage_controls(audit_report):
    """Verifies presence of transductive and inductive split architectures with leakage controls."""
    splits = audit_report["splitRecommendations"]
    assert "transductiveSplit" in splits
    assert "drugInductiveSplit" in splits
    assert "diseaseInductiveSplit" in splits
    assert "baselineEvaluationProtocols" in splits

    assert len(splits["transductiveSplit"]["leakageControls"]) >= 3
    assert len(splits["drugInductiveSplit"]["leakageControls"]) >= 2
