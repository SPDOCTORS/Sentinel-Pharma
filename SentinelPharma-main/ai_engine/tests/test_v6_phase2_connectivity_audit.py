"""Tests verifying the SentinelPharma V6 Phase 2 graph connectivity audit artifact and metrics."""
import json
from pathlib import Path
import pytest


AUDIT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "open_targets" / "audits" / "v6_phase2_connectivity_audit.json"


def test_v6_phase2_connectivity_audit_file_integrity():
    """Verifies that the connectivity audit report exists, is valid JSON, and adheres to schema."""
    assert AUDIT_PATH.exists(), f"Audit file missing at {AUDIT_PATH}"
    with open(AUDIT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["auditVersion"] == "v6-phase2-connectivity-audit-v1"
    assert "connectedNodeCounts" in data
    assert "relationCountsByType" in data
    assert "drugTargetDiseasePaths" in data
    assert "ambiguousMappingsSeparateReport" in data


def test_v6_phase2_connected_node_metrics():
    """Verifies connected node counts meet the 2,000+ diseases and 5,000+ drugs expansion targets."""
    with open(AUDIT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = data["connectedNodeCounts"]
    # Connected drugs target: 5,000+ (actual: 6,057)
    assert nodes["drugs"]["totalConnectedTrustedDrugs"] >= 5000
    assert nodes["drugs"]["connectedThroughCuratedMechanisms"] >= 4000
    assert nodes["drugs"]["connectivityExpansionFactorVsV5"] >= 3000.0

    # Connected targets/genes
    assert nodes["genes"]["totalConnectedTrustedGenes"] >= 2400

    # Connected diseases target: 2,000+ (actual: 21,358)
    assert nodes["diseases"]["totalConnectedTrustedDiseases"] >= 20000

    # Connected human pathways
    assert nodes["pathways"]["connectedToTrustedGenes"] >= 1800


def test_v6_phase2_relation_counts_and_curated_separation():
    """Verifies that curated mechanisms are kept distinct from bioactivity-derived edges."""
    with open(AUDIT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    rels = data["relationCountsByType"]
    # Curated mechanisms separated from bioactivity
    assert rels["drugTargetCuratedMechanismTrusted"] == 11701
    assert rels["drugTargetBioactivityTrusted"] == 15994
    assert rels["totalDrugTargetTrusted"] == 27695

    # Open Targets disease-target associations
    assert rels["diseaseTargetTrustedAll"] >= 1800000
    assert rels["diseaseTargetTrustedScoreGte01"] >= 180000

    # Reactome 97 pathway edges
    assert rels["targetPathwayTrusted"] >= 15000

    # Curated drug indications
    assert rels["drugIndicationCurated"] >= 50000


def test_v6_phase2_drug_target_disease_paths_and_ambiguity_separation():
    """Verifies multi-hop path volume, novel repurposing candidates, and separate reporting of ambiguous edges."""
    with open(AUDIT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    paths = data["drugTargetDiseasePaths"]
    # Curated mechanism paths
    assert paths["curatedMechanisms"]["distinctPaths_D_T_Di"] >= 13000000
    assert paths["curatedMechanisms"]["distinctDrugDiseasePairs_D_Di"] >= 8000000
    assert paths["curatedMechanisms"]["pairsMatchingCuratedIndications"] >= 10000
    assert paths["curatedMechanisms"]["novelRepurposingCandidatePairs"] >= 8000000

    # Total trusted paths
    assert paths["combinedTrustedTotal"]["distinctPaths_D_T_Di"] >= 27000000
    assert paths["combinedTrustedTotal"]["distinctDrugDiseasePairs_D_Di"] >= 14000000

    # Ambiguous mappings reported separately
    amb = data["ambiguousMappingsSeparateReport"]
    assert amb["ambiguousTargetCount"] == 221
    assert amb["ambiguousCuratedEdges"] == 705
    assert amb["ambiguousBioactivityEdges"] == 2460
    assert amb["ambiguousDistinctPaths_D_T_Di"] >= 1000000
