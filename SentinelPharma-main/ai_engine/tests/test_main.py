"""
Tests for SentinelPharma AI Engine main application
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings


@pytest.fixture
def client():
    """Test client fixture"""
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client):
    """Test health check endpoint returns correct response"""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "healthy"
    assert data["service"] == "sentinelpharma-ai-engine"
    assert "version" in data
    assert "timestamp" in data
    assert "mode_available" in data
    assert isinstance(data["mode_available"], dict)


def test_root_endpoint(client):
    """Test root endpoint"""
    response = client.get("/")

    assert response.status_code == 200
    assert "SentinelPharma" in response.text


def test_sensitive_endpoint_requires_internal_service_token(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")

    assert client.get("/api/gnn/status").status_code == 401
    assert client.get("/api/gnn/status", headers={"X-Internal-Service-Token": "test-internal-token"}).status_code == 200


def test_synthetic_research_is_unavailable_outside_demo_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr(settings, "DEMO_MODE", False)

    response = client.post(
        "/api/analyze",
        headers={"X-Internal-Service-Token": "test-internal-token"},
        json={"molecule": "Aspirin", "mode": "secure", "request_id": "test-request"},
    )

    assert response.status_code == 503
    assert response.json()["dataMode"] == "UNAVAILABLE"
    assert response.json()["error"]["code"] == "SOURCE_NOT_CONFIGURED"


def test_gnn_prediction_is_labelled_as_model_prediction(client, monkeypatch):
    class FakeGnn:
        def predict(self, disease, top_k):
            return {"model": "test-gnn-v1", "disease": disease, "candidates": []}

    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    app.state.gnn_repurposing = FakeGnn()
    response = client.post(
        "/api/gnn/repurpose",
        headers={"X-Internal-Service-Token": "test-internal-token"},
        json={"disease": "Test disease", "top_k": 1},
    )

    assert response.status_code == 200
    assert response.json()["dataMode"] == "MODEL_PREDICTION"
    assert response.json()["metadata"]["modelVersion"] == "test-gnn-v1"


def test_demo_agent_response_has_explicit_demo_provenance(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr(settings, "DEMO_MODE", True)

    response = client.get("/api/agents/status", headers={"X-Internal-Service-Token": "test-internal-token"})

    assert response.status_code == 200
    assert response.json()["dataMode"] == "DEMO_SYNTHETIC"
    assert response.json()["verificationStatus"] == "DEMO_ONLY"


def test_pubmed_endpoint_requires_internal_auth_and_returns_source_backed_data(client, monkeypatch):
    class FakePubMedService:
        async def search(self, query, limit):
            return {"query": query, "retrievedAt": "2026-01-01T00:00:00+00:00", "evidence": [{
                "sourceId": "12345678", "dataMode": "SOURCE_BACKED", "verificationStatus": "VERIFIED_SOURCE"
            }]}

    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr("app.main.PubMedService", FakePubMedService)
    assert client.post("/api/evidence/pubmed/search", json={"query": "metformin"}).status_code == 401

    response = client.post(
        "/api/evidence/pubmed/search",
        headers={"X-Internal-Service-Token": "test-internal-token"},
        json={"query": "metformin", "limit": 1},
    )
    assert response.status_code == 200
    assert response.json()["dataMode"] == "SOURCE_BACKED"
    assert response.json()["evidence"][0]["sourceId"] == "12345678"


def test_clinical_trials_endpoint_requires_internal_auth(client, monkeypatch):
    class FakeClinicalTrialsService:
        async def search(self, *_args):
            return {"drug": "metformin", "condition": "pancreatic cancer", "query": None,
                    "retrievedAt": "2026-01-01T00:00:00+00:00", "evidence": []}

    monkeypatch.setattr(settings, "INTERNAL_SERVICE_TOKEN", "test-internal-token")
    monkeypatch.setattr("app.main.ClinicalTrialsService", FakeClinicalTrialsService)
    assert client.post("/api/evidence/clinical-trials/search", json={"drug": "metformin"}).status_code == 401
    response = client.post("/api/evidence/clinical-trials/search", headers={"X-Internal-Service-Token": "test-internal-token"}, json={"drug": "metformin"})
    assert response.status_code == 200
    assert response.json()["dataMode"] == "SOURCE_BACKED"
