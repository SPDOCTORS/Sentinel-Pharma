import pytest

from app.services import research_workflow
from app.services.pubmed_service import PubMedUnavailable


def evidence(source_id, url):
    return {
        "sourceId": source_id,
        "sourceUrl": url,
        "sourceName": "Test source",
        "retrievedAt": "2026-01-01T00:00:00Z",
        "dataMode": "SOURCE_BACKED",
        "verificationStatus": "VERIFIED_SOURCE",
    }


@pytest.mark.asyncio
async def test_live_workflow_keeps_source_records_and_model_ranking_separate(monkeypatch):
    class PubMed:
        async def search(self, query, limit):
            assert query == "metformin Type 2 Diabetes"
            return {"retrievedAt": "2026-01-01T00:00:00Z", "evidence": [evidence("123", "https://pubmed.ncbi.nlm.nih.gov/123/")]}

    class Trials:
        async def search(self, drug, condition, limit):
            return {"retrievedAt": "2026-01-01T00:00:00Z", "evidence": [evidence("NCT123", "https://clinicaltrials.gov/study/NCT123")]}

    class Gnn:
        def predict(self, disease, top_k):
            return {"model": "test", "candidates": [{"drug": "Metformin", "score": 0.5}]}

    monkeypatch.setattr(research_workflow, "PubMedService", PubMed)
    monkeypatch.setattr(research_workflow, "ClinicalTrialsService", Trials)
    result = await research_workflow.analyze_live_research("metformin", "Type 2 Diabetes", "request-1", Gnn())
    assert result["dataMode"] == "SOURCE_BACKED"
    assert [record["sourceId"] for record in result["citations"]] == ["123", "NCT123"]
    assert result["modelPrediction"]["dataMode"] == "MODEL_PREDICTION"
    assert result["modelPrediction"]["candidates"][0]["drug"] == "Metformin"
    assert result["researchMode"] == "live"


@pytest.mark.asyncio
async def test_failed_live_source_never_substitutes_synthetic_records(monkeypatch):
    class PubMed:
        async def search(self, query, limit):
            raise PubMedUnavailable("network down")

    class Trials:
        async def search(self, drug, condition, limit):
            return {"retrievedAt": "2026-01-01T00:00:00Z", "evidence": []}

    monkeypatch.setattr(research_workflow, "PubMedService", PubMed)
    monkeypatch.setattr(research_workflow, "ClinicalTrialsService", Trials)
    result = await research_workflow.analyze_live_research("metformin", None, "request-2", None)
    assert result["dataMode"] == "UNAVAILABLE"
    assert result["sourceResults"]["pubmed"]["dataMode"] == "UNAVAILABLE"
    assert result["citations"] == []
    assert result["modelPrediction"]["dataMode"] == "UNAVAILABLE"
