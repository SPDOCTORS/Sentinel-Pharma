from pathlib import Path

import yaml


ROOT = Path(__file__).parents[2]
COMPOSE_PATH = ROOT / "docker-compose.prod.yml"


def _environment_values(service):
    values = service["environment"]
    if isinstance(values, dict):
        return values
    return dict(value.split("=", 1) for value in values)


def test_production_compose_requires_and_propagates_internal_service_token():
    compose = yaml.safe_load(COMPOSE_PATH.read_text(encoding="utf-8"))
    services = compose["services"]

    server_environment = _environment_values(services["server"])
    engine_environment = _environment_values(services["ai-engine"])

    required = "${INTERNAL_SERVICE_TOKEN:?Set INTERNAL_SERVICE_TOKEN in your production environment}"
    assert server_environment["INTERNAL_SERVICE_TOKEN"] == required
    assert engine_environment["INTERNAL_SERVICE_TOKEN"] == required


def test_production_compose_requires_authenticated_redis_and_readiness_healthcheck():
    compose = yaml.safe_load(COMPOSE_PATH.read_text(encoding="utf-8"))
    services = compose["services"]
    redis_environment = _environment_values(services["redis"])
    server_environment = _environment_values(services["server"])

    assert redis_environment["REDIS_PASSWORD"] == "${REDIS_PASSWORD:?Set REDIS_PASSWORD in your production environment}"
    assert "--requirepass" in services["redis"]["command"]
    assert "$$REDIS_PASSWORD" in services["redis"]["healthcheck"]["test"][1]
    assert server_environment["REDIS_PASSWORD"] == "${REDIS_PASSWORD:?Set REDIS_PASSWORD in your production environment}"
    assert services["server"]["healthcheck"]["test"] == ["CMD", "curl", "-f", "http://localhost:3001/ready"]
