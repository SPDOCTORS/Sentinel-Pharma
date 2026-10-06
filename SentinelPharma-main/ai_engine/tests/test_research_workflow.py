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

    class Shadow:
        def predict(self, disease, top_k):
            return {
                "model": "frozen-v5-rgcn-shadow",
                "candidates": [{"drug": "Shadow candidate", "score": 0.7}],
                "modelLineage": {
                    "graphDatasetVersion": "biomedical_graph_v5",
                    "graphDatasetHash": "v5-hash",
                    "checkpointHash": "checkpoint-hash",
                },
            }

    class EvidenceGraph:
        def subgraph_or_unavailable(self, drug, disease):
            return {
                "success": True,
                "dataMode": "SOURCE_BACKED",
                "verificationStatus": "VERIFIED_SOURCE",
                "graphDatasetVersion": "biomedical_graph_v5",
                "nodes": [{"id": "drug", "type": "DRUG", "provenance": [{"source": "ChEMBL"}]}],
                "edges": [{"source": "drug", "target": "target", "type": "DRUG_TARGET", "provenance": [{"source": "ChEMBL"}]}],
            }

    monkeypatch.setattr(research_workflow, "PubMedService", PubMed)
    monkeypatch.setattr(research_workflow, "ClinicalTrialsService", Trials)
    result = await research_workflow.analyze_live_research(
        "metformin", "Type 2 Diabetes", "request-1", Gnn(), Shadow(), EvidenceGraph()
    )
    assert result["dataMode"] == "SOURCE_BACKED"
    assert [record["sourceId"] for record in result["citations"]] == ["123", "NCT123"]
    assert result["modelPrediction"]["dataMode"] == "MODEL_PREDICTION"
    assert result["modelPrediction"]["candidates"][0]["drug"] == "Metformin"
    assert result["shadowModelPrediction"]["dataMode"] == "MODEL_PREDICTION"
    assert result["shadowModelPrediction"]["verificationStatus"] == "MODEL_INFERENCE"
    assert result["shadowModelPrediction"]["shadow"] is True
    assert result["shadowModelPrediction"]["primary"] is False
    assert result["shadowModelPrediction"]["modelLineage"]["graphDatasetVersion"] == "biomedical_graph_v5"
    assert result["knowledge_graph"]["dataMode"] == "SOURCE_BACKED"
    assert result["knowledge_graph"]["graphDatasetVersion"] == "biomedical_graph_v5"
    assert result["researchMode"] == "live"


@pytest.mark.asyncio
async def test_v5_shadow_failure_never_replaces_or_fails_primary_ranking(monkeypatch):
    class PubMed:
        async def search(self, query, limit):
            return {"retrievedAt": "2026-01-01T00:00:00Z", "evidence": []}

    class Trials:
        async def search(self, drug, condition, limit):
            return {"retrievedAt": "2026-01-01T00:00:00Z", "evidence": []}

    class Gnn:
        def predict(self, disease, top_k):
            return {"model": "primary-graphsage", "candidates": [{"drug": "Primary", "score": 0.5}]}

    class Shadow:
        def predict(self, disease, top_k):
            raise ValueError("Unknown or ambiguous disease identifier")

    class EvidenceGraph:
        def subgraph_or_unavailable(self, drug, disease):
            raise RuntimeError("broken graph artifact")

    monkeypatch.setattr(research_workflow, "PubMedService", PubMed)
    monkeypatch.setattr(research_workflow, "ClinicalTrialsService", Trials)
    result = await research_workflow.analyze_live_research(
        "drug", "unknown disease", "request-shadow", Gnn(), Shadow(), EvidenceGraph()
    )

    assert result["modelPrediction"]["model"] == "primary-graphsage"
    assert result["modelPrediction"]["dataMode"] == "MODEL_PREDICTION"
    assert result["shadowModelPrediction"]["dataMode"] == "UNAVAILABLE"
    assert result["shadowModelPrediction"]["unavailableReason"]["code"] == "V5_SHADOW_UNAVAILABLE"
    assert result["knowledge_graph"]["dataMode"] == "UNAVAILABLE"
    assert result["knowledge_graph"]["nodes"] == []
    assert result["modelPrediction"]["model"] == "primary-graphsage"
    assert {item["name"]: item["status"] for item in result["agents_executed"]}["FrozenV5ShadowService"] == "failed"


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
    assert result["knowledge_graph"]["dataMode"] == "UNAVAILABLE"
    assert result["knowledge_graph"]["nodes"] == []
