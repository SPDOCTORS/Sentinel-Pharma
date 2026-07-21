"""
Tests for SentinelPharma AI Engine main application
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Test client fixture"""
    return TestClient(app)


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