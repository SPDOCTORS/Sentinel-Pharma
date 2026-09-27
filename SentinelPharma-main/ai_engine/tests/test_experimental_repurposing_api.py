"""Focused contract tests for the Phase 3A experimental repurposing API."""
from __future__ import annotations

import socket

from fastapi.testclient import TestClient
import pytest

from app.core.config import settings
from app.main import app
import app.main as main


TOKEN = "phase-3a-test-token"


def _result(disease_id: str = "EFO:TEST", score: float = 0.7, structural_status: str = "AVAILABLE"):
    return {
        "candidate": {
            "drug": {"id": "CHEMBL:CHEMBL1000", "name": "Cetirizine", "entityType": "DRUG"},
            "disease": {"id": disease_id, "name": "Test disease", "entityType": "DISEASE"},
            "rank": 1,
            "modelScore": score,
            "candidateStatus": "UNOBSERVED_CANDIDATE",
            "provenance": "MODEL_PREDICTION",
        },
        "model": {
            "architecture": "R-GCN",
            "graphDatasetVersion": "biomedical_graph_v4",
            "graphDatasetHash": "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4",
            "checkpointHash": "019ca2c5cb86f33e230b05bf6df3b6ba5090db39d1818b7b5ee81b7ad2fe287a",
            "scoreSemantics": "experimental model score; not probability",
        },
        "structuralEvidence": {
            "status": structural_status,
            "graphDatasetVersion": "biomedical_graph_v5" if structural_status == "AVAILABLE" else None,
            "graphDatasetHash": "9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90" if structural_status == "AVAILABLE" else None,
            "sharedTargets": [],
            "sharedTargetCount": 0,
            "pathways": [],
            "sources": [],
        },
        "externalEvidence": {
            "pubmed": {"success": False, "dataMode": "UNAVAILABLE", "error": {"code": "NOT_REQUESTED"}},
            "clinicalTrials": {"success": False, "dataMode": "UNAVAILABLE", "error": {"code": "NOT_REQUESTED"}},
        },
        "limitations": ["V5 structural evidence does not alter V4 model rank or score."],
    }


class FakeCandidateService:
    def rank_candidates(self, drug_id, top_k=10):
        if drug_id != "CHEMBL:CHEMBL1000":
            raise ValueError("Unknown or ambiguous drug identifier")
        return [_result(f"EFO:{index}", 0.7 - index / 1000) for index in range(1, top_k + 1)]

    def get_candidate_details(self, drug_id, disease_id):
        self.rank_candidates(drug_id, 1)
        if disease_id == "EFO:KNOWN":
            raise ValueError("Disease is a known indication or is not a V4 disease")
        if disease_id == "EFO:UNAVAILABLE":
            return _result(disease_id, structural_status="UNAVAILABLE")
        return _result(disease_id)

    def get_known_indications(self, drug_id):
        self.rank_candidates(drug_id, 1)
        return [{
            "drug": {"id": "CHEMBL:CHEMBL1000", "name": "Cetirizine", "entityType": "DRUG"},
            "disease": {"id": "MONDO:KNOWN", "name": "Known disease", "entityType": "DISEASE"},
            "candidateStatus": "KNOWN_INDICATION",
            "relationId": {"source": "CHEMBL:CHEMBL1000", "target": "MONDO:KNOWN", "relationType": "DRUG_INDICATION"},
            "provenance": [[{"source": "frozen"}]],
        }]

    async def enrich_candidate_evidence(self, drug_id, disease_id):
        result = self.get_candidate_details(drug_id, disease_id)
        result["externalEvidence"] = {
            "pubmed": {"success": False, "dataMode": "UNAVAILABLE", "error": {"code": "PUBMED_UNAVAILABLE"}},
            "clinicalTrials": {"success": False, "dataMode": "UNAVAILABLE", "error": {"code": "CLINICAL_TRIALS_UNAVAILABLE"}},
        }
        return result


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(main, "_experimental_candidate_service", FakeCandidateService())
    with TestClient(app) as test_client:
        yield test_client


def _headers():
    return {"X-Internal-Service-Token": TOKEN}


def test_ranking_contract_default_and_custom_top_k(client, monkeypatch):
    monkeypatch.setattr("httpx.Client", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network call")))
    path = "/api/experimental/repurposing/drugs/CHEMBL:CHEMBL1000/candidates"
    response = client.get(path, headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["candidateCount"] == 10
    assert body["candidates"][0]["candidate"]["candidateStatus"] == "UNOBSERVED_CANDIDATE"
    assert body["candidates"][0]["candidate"]["provenance"] == "MODEL_PREDICTION"
    assert body["candidates"][0]["model"]["graphDatasetVersion"] == "biomedical_graph_v4"
    assert body["structuralGraph"]["graphDatasetVersion"] == "biomedical_graph_v5"
    assert body["candidates"][0]["structuralEvidence"]["lookupStatus"] == "AVAILABLE"
    assert body["candidates"][0]["structuralEvidence"]["supportStatus"] == "NO_STRUCTURAL_SUPPORT"
    assert "probability" not in body["candidates"][0]["candidate"]
    repeated = client.get(path, headers=_headers()).json()
    assert [item["candidate"]["disease"]["id"] for item in repeated["candidates"]] == [item["candidate"]["disease"]["id"] for item in body["candidates"]]
    assert [item["candidate"]["modelScore"] for item in repeated["candidates"]] == [item["candidate"]["modelScore"] for item in body["candidates"]]
    assert client.get(path + "?top_k=3", headers=_headers()).json()["candidateCount"] == 3


def test_ranking_validation_unknown_drug_and_authentication(client):
    path = "/api/experimental/repurposing/drugs/CHEMBL:CHEMBL1000/candidates"
    assert client.get(path).status_code == 401
    assert client.get(path + "?top_k=0", headers=_headers()).status_code == 422
    assert client.get(path + "?top_k=51", headers=_headers()).status_code == 422
    assert client.get("/api/experimental/repurposing/drugs/UNKNOWN/candidates", headers=_headers()).status_code == 404


def test_detail_known_indications_and_explicit_unavailable_evidence(client, monkeypatch):
    monkeypatch.setattr("httpx.Client", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network call")))
    base = "/api/experimental/repurposing/drugs/CHEMBL:CHEMBL1000"
    detail = client.get(base + "/candidates/EFO:TEST", headers=_headers())
    assert detail.status_code == 200
    assert detail.json()["structuralEvidence"]["supportStatus"] == "NO_STRUCTURAL_SUPPORT"
    unavailable = client.get(base + "/candidates/EFO:UNAVAILABLE", headers=_headers()).json()
    assert unavailable["structuralEvidence"]["lookupStatus"] == "UNAVAILABLE"
    assert unavailable["structuralEvidence"]["supportStatus"] == "UNAVAILABLE"
    assert client.get(base + "/candidates/EFO:KNOWN", headers=_headers()).status_code == 404
    known = client.get(base + "/known-indications", headers=_headers()).json()
    assert known["indications"][0]["candidateStatus"] == "KNOWN_INDICATION"
    assert known["indications"][0]["candidateStatus"] != "UNOBSERVED_CANDIDATE"
    evidence = client.post(
        "/api/experimental/repurposing/evidence",
        headers=_headers(), json={"drug_id": "CHEMBL:CHEMBL1000", "disease_id": "EFO:TEST"},
    )
    assert evidence.status_code == 200
    assert evidence.json()["externalEvidence"]["pubmed"]["dataMode"] == "UNAVAILABLE"


def test_openapi_exposes_experimental_routes(client):
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/api/experimental/repurposing/drugs/{drug_id}/candidates"]["get"]
    assert "Experimental Drug Repurposing" in operation["tags"]
    assert "not a probability" in operation["description"]


def test_artifact_failure_is_safe_and_does_not_leak_paths_or_tracebacks(client, monkeypatch):
    class UnavailableService:
        def rank_candidates(self, *_args):
            raise ValueError("Checkpoint SHA256 mismatch at C:\\private\\artifact.pt")

    monkeypatch.setattr(main, "_experimental_candidate_service", UnavailableService())
    response = client.get(
        "/api/experimental/repurposing/drugs/CHEMBL:CHEMBL1000/candidates",
        headers=_headers(),
    )
    assert response.status_code == 503
    assert "C:\\" not in response.text
    assert "traceback" not in response.text.lower()


def test_real_frozen_cetirizine_ranking_uses_no_network(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", TOKEN)
    monkeypatch.setattr(main, "_experimental_candidate_service", None)
    with TestClient(app) as client:
        monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network call")))
        response = client.get(
            "/api/experimental/repurposing/drugs/CHEMBL:CHEMBL1000/candidates?top_k=10",
            headers=_headers(),
        )
    assert response.status_code == 200
    body = response.json()
    assert [item["candidate"]["disease"]["id"] for item in body["candidates"]] == [
        "EFO:0003102", "EFO:0003144", "EFO:0004192", "EFO:0005252", "EFO:1001034",
        "EFO:1001219", "HP:0000616", "MONDO:0003751", "MONDO:0021233", "MESH:D013508",
    ]
    assert all(item["structuralEvidence"]["supportStatus"] == "NO_STRUCTURAL_SUPPORT" for item in body["candidates"])
