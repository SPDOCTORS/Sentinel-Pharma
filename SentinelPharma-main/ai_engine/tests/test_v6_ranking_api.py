"""SentinelPharma V6 Read-Only Experimental Ranking API Tests.

Verifies:
1. Manifest and metadata loading via GET /api/v6/status.
2. Deterministic candidate ranking for repeated queries.
3. Proper HTTP 404 error handling for unsupported diseases.
4. Correct handling of missing evidence (disconnected candidate drugs with 0 shared targets).
5. Model loading failure handling (missing manifest, missing checkpoints, hash mismatches).
6. Explicit MODEL_PREDICTION status, provenance, and regulatory disclaimer verification.
7. Strict isolation from production V4/V5 pipelines.
8. Proper filtering with exclude_known_indications flag.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.services.gnn.v6_ranking_api_service import (
    V6ExperimentalRankingService,
    REGULATORY_NOTICE,
)

TOKEN = "test-internal-service-token"


@pytest.fixture(scope="module")
def client():
    """Creates FastAPI test client with configured internal service token and executed lifespan."""
    settings.INTERNAL_SERVICE_TOKEN = TOKEN
    with TestClient(app) as test_client:
        test_client.headers.update({"X-Internal-Service-Token": TOKEN})
        yield test_client


@pytest.fixture(scope="module")
def ranking_service() -> V6ExperimentalRankingService:
    """Initializes V6 ranking service singleton."""
    return V6ExperimentalRankingService()


# =====================================================================
# 1. STATUS & METADATA TESTS
# =====================================================================

def test_v6_status_endpoint(client: TestClient):
    """Verifies GET /api/v6/status returns frozen manifest and graph provenance."""
    response = client.get("/api/v6/status")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()

    assert data["ready"] is True
    assert data["dataMode"] == "MODEL_PREDICTION"
    assert data["verificationStatus"] == "EXPERIMENTAL_UNVALIDATED"
    assert "Not clinically validated" in data["regulatoryNotice"]

    # Manifest checks
    assert data["manifest"]["manifestVersion"] == "v6-locked-final-test-evaluation-manifest-v1"
    assert data["manifest"]["status"] == "LOCKED_READY_FOR_EVALUATION"

    # Graph stats checks
    bg = data["biomedicalGraph"]
    assert bg["numEntities"] == 12985
    assert bg["numRelations"] == 109007
    assert bg["numDrugs"] == 6057
    assert bg["numDiseases"] == 2605
    assert bg["numTargets"] == 2449
    assert bg["sha256"] == "24ceb3e4a57dd8916bd18e1cba51c9675cb9bfb44aac6a9c3ecf9021c937b4e0"

    # Model architecture checks
    m = data["model"]
    assert m["architecture"] == "Connectivity-Aware Bilinear Interaction Logistic Hybrid Ranker"
    assert len(m["weights"]) == 4
    assert m["checkpoint"]["seed"] == 42
    assert m["checkpoint"]["sha256"] == "db1c2f8204af20a7da7ef889dde0dcdd0146799f46086c06909c1b3e3dce36cd"


# =====================================================================
# 2. DETERMINISTIC RESULTS TESTS
# =====================================================================

def test_v6_repurpose_deterministic_post(client: TestClient):
    """Verifies that consecutive POST /api/v6/repurpose queries return bit-exact identical rankings."""
    payload = {"disease": "EFO:0000180", "top_k": 10, "exclude_known_indications": False}

    resp1 = client.post("/api/v6/repurpose", json=payload)
    resp2 = client.post("/api/v6/repurpose", json=payload)

    assert resp1.status_code == 200
    assert resp2.status_code == 200

    data1 = resp1.json()
    data2 = resp2.json()

    assert data1["candidatesReturned"] == 10
    assert data2["candidatesReturned"] == 10

    # Verify bit-exact consistency across all candidate records
    for c1, c2 in zip(data1["candidates"], data2["candidates"]):
        assert c1["rank"] == c2["rank"]
        assert c1["drug"]["id"] == c2["drug"]["id"]
        assert c1["drug"]["name"] == c2["drug"]["name"]
        assert c1["rankingScore"] == c2["rankingScore"]
        assert c1["logit"] == c2["logit"]
        assert c1["features"] == c2["features"]
        assert c1["isTwoHopConnected"] == c2["isTwoHopConnected"]
        assert c1["sharedTargetCount"] == c2["sharedTargetCount"]
        assert c1["sharedTargets"] == c2["sharedTargets"]


def test_v6_repurpose_name_resolution_consistency(client: TestClient):
    """Verifies that querying by canonical ID or disease name yields identical candidate rankings."""
    resp_by_id = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 5})
    resp_by_name = client.post("/api/v6/repurpose", json={"disease": "HIV-1 infection", "top_k": 5})

    assert resp_by_id.status_code == 200
    assert resp_by_name.status_code == 200

    cands_id = resp_by_id.json()["candidates"]
    cands_name = resp_by_name.json()["candidates"]

    assert len(cands_id) == 5
    assert len(cands_name) == 5

    for c1, c2 in zip(cands_id, cands_name):
        assert c1["drug"]["id"] == c2["drug"]["id"]
        assert c1["rankingScore"] == c2["rankingScore"]


def test_v6_repurpose_get_endpoints_consistency(client: TestClient):
    """Verifies GET query and GET path endpoints produce identical results to POST."""
    resp_post = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 5})
    resp_get_query = client.get("/api/v6/repurpose?disease=EFO:0000180&top_k=5")
    resp_get_path = client.get("/api/v6/repurpose/EFO:0000180?top_k=5")

    assert resp_post.status_code == 200
    assert resp_get_query.status_code == 200
    assert resp_get_path.status_code == 200

    cands_post = resp_post.json()["candidates"]
    cands_query = resp_get_query.json()["candidates"]
    cands_path = resp_get_path.json()["candidates"]

    for cp, cq, cpath in zip(cands_post, cands_query, cands_path):
        assert cp["drug"]["id"] == cq["drug"]["id"] == cpath["drug"]["id"]
        assert cp["rankingScore"] == cq["rankingScore"] == cpath["rankingScore"]


# =====================================================================
# 3. UNSUPPORTED DISEASE TESTS
# =====================================================================

def test_v6_unsupported_disease_returns_404(client: TestClient):
    """Verifies that querying a nonexistent disease returns HTTP 404 with helpful error."""
    resp = client.post(
        "/api/v6/repurpose",
        json={"disease": "NON_EXISTENT_DISEASE_DOID_999999", "top_k": 10},
    )
    assert resp.status_code == 404
    data = resp.json()
    assert data["success"] is False
    assert "Unsupported disease" in data["error"]
    assert "not found in the frozen V6 biomedical graph" in data["error"]


def test_v6_unsupported_disease_get_returns_404(client: TestClient):
    """Verifies GET path parameter endpoint also returns HTTP 404 for unsupported disease."""
    resp = client.get("/api/v6/repurpose/DOID:9999999")
    assert resp.status_code == 404
    assert "Unsupported disease" in resp.json()["error"]


# =====================================================================
# 4. MISSING EVIDENCE (DISCONNECTED CANDIDATES) TESTS
# =====================================================================

def test_v6_missing_evidence_disconnected_candidate(client: TestClient):
    """Verifies that a candidate with 0 shared targets is handled smoothly with isTwoHopConnected=False."""
    # CETIRIZINE (CHEMBL:CHEMBL1000) has 0 shared targets with HIV-1 infection (EFO:0000180)
    resp = client.post(
        "/api/v6/score-pair",
        json={"drug": "CHEMBL:CHEMBL1000", "disease": "EFO:0000180"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["success"] is True
    assert data["dataMode"] == "MODEL_PREDICTION"
    assert data["isTwoHopConnected"] is False
    assert data["sharedTargetCount"] == 0
    assert data["sharedTargets"] == []

    # Features: twoHopScore must be exactly 0.0 and interactionTerm must be 0.0
    features = data["features"]
    assert features["twoHopScore"] == 0.0
    assert features["interactionTerm"] == 0.0
    assert features["diseasePopularity"] >= 0

    # Ranking score must be valid float in (0, 1) despite zero direct 2-hop evidence
    assert 0.0 < data["rankingScore"] < 1.0
    assert isinstance(data["logit"], float)


def test_v6_connected_candidate_has_evidence(client: TestClient):
    """Verifies that a connected candidate has detailed direct shared-target evidence."""
    # RITONAVIR (CHEMBL:CHEMBL163) shares targets CYP3A4, CYP3A5, CYP3A43 with HIV-1 (EFO:0000180)
    resp = client.post(
        "/api/v6/score-pair",
        json={"drug": "CHEMBL:CHEMBL163", "disease": "EFO:0000180"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["isTwoHopConnected"] is True
    assert data["sharedTargetCount"] >= 1
    assert len(data["sharedTargets"]) == data["sharedTargetCount"]

    first_target = data["sharedTargets"][0]
    assert "targetId" in first_target
    assert "targetName" in first_target
    assert "drugRelationType" in first_target
    assert "drugTargetWeight" in first_target
    assert "diseaseAssociationScore" in first_target
    assert "pathContribution" in first_target
    assert first_target["pathContribution"] > 0.0


# =====================================================================
# 5. MODEL LOADING FAILURE TESTS
# =====================================================================

def test_v6_missing_manifest_raises_file_not_found():
    """Verifies that loading service with invalid manifest path raises FileNotFoundError."""
    invalid_path = Path("nonexistent_manifest_file_12345.json")
    with pytest.raises(FileNotFoundError, match="Locked test evaluation manifest not found"):
        V6ExperimentalRankingService(manifest_path=invalid_path)


def test_v6_corrupted_manifest_hash_raises_value_error(tmp_path: Path):
    """Verifies that SHA-256 hash mismatch during initialization raises ValueError."""
    # Read valid manifest
    ai_engine_root = Path(__file__).resolve().parents[1]
    valid_manifest_path = (
        ai_engine_root
        / "artifacts"
        / "gnn_experiments"
        / "v6_locked_test_spec"
        / "locked_test_evaluation_manifest.json"
    )
    with open(valid_manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)

    # Tamper with graph sha256
    manifest_data["frozenBiomedicalGraph"]["sha256"] = "0000000000000000000000000000000000000000000000000000000000000000"

    tampered_manifest = tmp_path / "tampered_manifest.json"
    with open(tampered_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f)

    with pytest.raises(ValueError, match="Frozen graph SHA-256 mismatch"):
        V6ExperimentalRankingService(manifest_path=tampered_manifest, verify_hashes=True)


# =====================================================================
# 6. EXPLICIT MODEL_PREDICTION & REGULATORY NOTICE TESTS
# =====================================================================

def test_v6_regulatory_notice_and_data_mode(client: TestClient):
    """Verifies all responses include explicit MODEL_PREDICTION dataMode and regulatory disclaimer."""
    resp = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 5})
    assert resp.status_code == 200
    data = resp.json()

    assert data["dataMode"] == "MODEL_PREDICTION"
    assert data["verificationStatus"] == "EXPERIMENTAL_UNVALIDATED"
    assert data["regulatoryNotice"] == REGULATORY_NOTICE

    for candidate in data["candidates"]:
        assert candidate["dataMode"] == "MODEL_PREDICTION"
        assert candidate["candidateStatus"] in ("UNOBSERVED_CANDIDATE", "KNOWN_INDICATION")
        assert candidate["provenance"]["model"] == "SentinelPharma-V6-ConnectivityAwareHybrid"
        assert candidate["provenance"]["checkpoint"] == "best_model_weights.pt"
        assert candidate["provenance"]["checkpointSeed"] == 42


# =====================================================================
# 7. FILTERING KNOWN INDICATIONS TEST
# =====================================================================

def test_v6_exclude_known_indications_flag(client: TestClient):
    """Verifies that exclude_known_indications=True filters out known indications."""
    resp_all = client.post(
        "/api/v6/repurpose",
        json={"disease": "EFO:0000180", "top_k": 20, "exclude_known_indications": False},
    )
    resp_unobserved = client.post(
        "/api/v6/repurpose",
        json={"disease": "EFO:0000180", "top_k": 20, "exclude_known_indications": True},
    )

    assert resp_all.status_code == 200
    assert resp_unobserved.status_code == 200

    unobserved_cands = resp_unobserved.json()["candidates"]
    for cand in unobserved_cands:
        assert cand["isKnownIndication"] is False
        assert cand["candidateStatus"] == "UNOBSERVED_CANDIDATE"


# =====================================================================
# 8. PRODUCTION V4/V5 ISOLATION TEST
# =====================================================================

def test_v6_production_v4_v5_isolation(client: TestClient):
    """Verifies that existing V4/V5 endpoints are intact and unaffected by V6 API."""
    resp_gnn_status = client.get("/api/gnn/status")
    assert resp_gnn_status.status_code == 200
    assert resp_gnn_status.json()["success"] is True

    # Check that V6 status returns its separate V6 metadata
    resp_v6_status = client.get("/api/v6/status")
    assert resp_v6_status.status_code == 200
    assert resp_v6_status.json()["service"] == "SentinelPharma-V6-Connectivity-Aware-Ranking-API"


# =====================================================================
# 9. REFINED CONTRACT SEMANTICS REGRESSION TESTS
# =====================================================================

def test_v6_ranking_score_uncalibrated_semantics(client: TestClient):
    """Verifies rankingScore is treated and documented as an uncalibrated relative score, not a clinical probability."""
    resp = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 5})
    assert resp.status_code == 200
    data = resp.json()

    # Top-level score semantics declaration
    assert "scoreSemantics" in data
    score_sem = data["scoreSemantics"]
    assert score_sem["type"] == "UNCALIBRATED_RELATIVE_RANKING_SCORE"
    assert score_sem["isClinicalProbability"] is False
    assert "not a calibrated probability" in score_sem["description"].lower()

    # Model metadata score semantics
    assert data["modelMetadata"]["scoreSemantics"] == "UNCALIBRATED_RELATIVE_RANKING_SCORE"

    # Candidate-level score semantics
    for cand in data["candidates"]:
        assert cand["scoreSemantics"] == "UNCALIBRATED_RELATIVE_RANKING_SCORE"
        assert 0.0 < cand["rankingScore"] < 1.0
        assert "not a clinical probability" in cand["provenance"]["scoreInterpretation"].lower()


def test_v6_is_known_indication_semantics_clarity(client: TestClient):
    """Verifies that isKnownIndication=False is clearly defined as absent from curated labels, not novel/ineffective."""
    resp = client.post(
        "/api/v6/repurpose",
        json={"disease": "EFO:0000180", "top_k": 50, "exclude_known_indications": False},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Top-level indication semantics declaration
    assert "indicationSemantics" in data
    ind_sem = data["indicationSemantics"]
    assert "recordedInCuratedLabels" in ind_sem
    assert "absentFromCuratedLabels" in ind_sem
    assert "does not denote therapeutic novelty" in ind_sem["absentFromCuratedLabels"].lower()
    assert "lack of clinical efficacy" in ind_sem["absentFromCuratedLabels"].lower()

    # Candidate-level indication status and provenance
    unobserved_cands = [c for c in data["candidates"] if not c["isKnownIndication"]]
    assert len(unobserved_cands) > 0, "Expected at least one candidate with isKnownIndication=False"

    for cand in unobserved_cands:
        assert cand["isKnownIndication"] is False
        assert cand["indicationStatus"] == "ABSENT_FROM_CURATED_LABELS"
        assert "absent from curated reference indication datasets" in cand["indicationProvenance"].lower()
        assert "does not denote therapeutic novelty" in cand["indicationProvenance"].lower()


def test_v6_shared_targets_labeled_as_computational_evidence(client: TestClient):
    """Verifies shared-target mechanisms are labeled as computational graph evidence, not proof of efficacy."""
    resp = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 5})
    assert resp.status_code == 200
    data = resp.json()

    # Top-level evidence semantics declaration
    assert "evidenceSemantics" in data
    ev_sem = data["evidenceSemantics"]
    assert ev_sem["category"] == "COMPUTATIONAL_GRAPH_EVIDENCE"
    assert "not clinical proof of therapeutic efficacy" in ev_sem["disclaimer"].lower()

    # Connected candidate evidence checks
    connected_cands = [c for c in data["candidates"] if c["isTwoHopConnected"]]
    assert len(connected_cands) > 0

    for cand in connected_cands:
        assert cand["structuralEvidenceCategory"] == "COMPUTATIONAL_GRAPH_EVIDENCE"
        assert "not clinical proof" in cand["structuralEvidenceDisclaimer"].lower()
        for target in cand["sharedTargets"]:
            assert target["evidenceCategory"] == "COMPUTATIONAL_GRAPH_EVIDENCE"
            assert target["evidenceType"] == "COMPUTATIONAL_GRAPH_EDGE"
            assert "not clinical proof of therapeutic efficacy" in target["evidenceInterpretation"].lower()


def test_v6_backward_compatibility_preserved(client: TestClient):
    """Verifies that all original response keys and types are strictly preserved."""
    resp = client.post("/api/v6/repurpose", json={"disease": "EFO:0000180", "top_k": 3})
    assert resp.status_code == 200
    data = resp.json()

    # Original top-level keys
    for key in ("success", "dataMode", "verificationStatus", "regulatoryNotice", "disease", "totalCandidatesScored", "candidatesReturned", "topK", "candidates", "modelMetadata"):
        assert key in data, f"Missing required top-level key: {key}"

    # Original candidate keys
    for cand in data["candidates"]:
        for ckey in ("rank", "drug", "rankingScore", "logit", "features", "isTwoHopConnected", "sharedTargetCount", "sharedTargets", "isKnownIndication", "candidateStatus", "dataMode", "provenance"):
            assert ckey in cand, f"Missing required candidate key: {ckey}"

        # Features dict must preserve original feature names
        assert "twoHopScore" in cand["features"]
        assert "diseasePopularity" in cand["features"]
        assert "rgcnProbability" in cand["features"]
        assert "interactionTerm" in cand["features"]

