"""Consistency and reconciliation tests for SentinelPharma V6 Phase 2 graph connectivity audit."""
import json
from pathlib import Path
import pytest


RECONCILIATION_REPORT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "open_targets" / "audits" / "v6_phase2_reconciliation_audit.json"


def test_reconciliation_report_file_integrity():
    """Verifies that the reconciliation audit report exists and has valid schema."""
    assert RECONCILIATION_REPORT_PATH.exists(), f"Reconciliation file missing at {RECONCILIATION_REPORT_PATH}"
    with open(RECONCILIATION_REPORT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["reportVersion"] == "v6-phase2-reconciliation-v1"
    assert "drugPopulationReconciliation" in data
    assert "diseasePopulationReconciliation" in data


def test_drug_population_reconciliation():
    """Reconciles 5,431 vs 16,754 vs 6,057 drug populations in ChEMBL 36."""
    with open(RECONCILIATION_REPORT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)["drugPopulationReconciliation"]

    # Total clinical entities in ChEMBL 36
    assert data["totalClinicalApprovedEntitiesInChEMBL"] == 16754
    assert data["uniqueParentDrugs"] == 14659
    assert data["saltFormsAndDerivatives"] == 2095
    assert data["smallMoleculeParentDrugs"] == 10719

    # Connected clinical drugs in V6
    assert data["connectedTrustedDrugsTotal"] == 6057
    assert data["connectedCuratedMechanismDrugs"] == 4223
    assert data["connectedBioactivityDrugs"] == 2821

    # Indication population
    assert data["drugsWithCuratedIndications"] == 9929
    assert data["totalCuratedIndicationPairs"] == 59340


def test_disease_population_reconciliation_and_thresholds():
    """Reconciles 2,240 vs 21,358 disease populations across score thresholds (0.1, 0.3, 0.5) with min 3 genes."""
    with open(RECONCILIATION_REPORT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)["diseasePopulationReconciliation"]

    assert data["totalOpenTargetsOntologyTerms"] == 47080
    assert data["diseasesWithRawAssociationScoreGt0"] == 21358

    th_map = data["thresholdCoverage"]

    # Threshold >= 0.1 (min 3 genes)
    th_01 = th_map["threshold_01_min3genes"]
    assert th_01["qualifyingDiseases"] == 4745
    assert th_01["diseaseTargetEdges"] == 177782
    assert th_01["connectedDrugs"]["curatedMechanism"] == 4220

    # Threshold >= 0.3 (min 3 genes) -> confirms feasibility plan target of ~2,240 diseases
    th_03 = th_map["threshold_03_min3genes"]
    assert th_03["qualifyingDiseases"] == 2605
    assert th_03["diseaseTargetEdges"] == 65382
    assert th_03["connectedDrugs"]["curatedMechanism"] == 4191

    # Threshold >= 0.5 (min 3 genes)
    th_05 = th_map["threshold_05_min3genes"]
    assert th_05["qualifyingDiseases"] == 898
    assert th_05["diseaseTargetEdges"] == 11069
    assert th_05["connectedDrugs"]["curatedMechanism"] == 3848


def test_independent_path_and_hypothesis_separation():
    """Verifies path arithmetic consistency and strict separation of validated indications from unlabeled hypotheses."""
    with open(RECONCILIATION_REPORT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)["diseasePopulationReconciliation"]["thresholdCoverage"]

    for th_name, th_data in data.items():
        cur = th_data["curatedMechanismPaths"]
        comb = th_data["combinedTrustedTotal"]

        # Mathematical identity: total pairs == validated matches + unlabeled hypotheses
        assert cur["distinctPairs_D_Di"] == cur["validatedIndicationMatches"] + cur["unlabeledRepurposingHypotheses"], \
            f"Curated pair mismatch in {th_name}"
        assert comb["distinctPairs_D_Di"] == comb["validatedIndicationMatches"] + comb["unlabeledRepurposingHypotheses"], \
            f"Combined pair mismatch in {th_name}"

        # Verified indications must be a strict non-zero subset of all paths
        assert cur["validatedIndicationMatches"] > 0
        assert cur["unlabeledRepurposingHypotheses"] > cur["validatedIndicationMatches"]
