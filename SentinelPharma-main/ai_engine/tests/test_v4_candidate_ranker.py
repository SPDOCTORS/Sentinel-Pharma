import asyncio
import json
from pathlib import Path

import pytest

from app.services.clinical_trials_service import ClinicalTrialsUnavailable
from app.services.gnn.v4_candidate_ranker import CandidateRanker, GRAPH_HASH
from app.services.pubmed_service import PubMedUnavailable


GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"


def ranker(): return CandidateRanker(GRAPH)


def test_validation_selected_checkpoint_and_graph_lineage_are_verified(tmp_path):
    value = ranker()
    assert value.selection["splitSeed"] == 42 and value.selection["modelSeed"] == 42
    assert value.selection["selectedEpoch"] == 7 and "No test metric" in value.selection["selectionPolicy"]
    with pytest.raises(ValueError, match="datasetHash mismatch"):
        CandidateRanker(GRAPH, expected_hash="wrong")
    bad = tmp_path / "bad"; bad.mkdir()
    (bad / "experiment_manifest.json").write_text(json.dumps({"graph": {"datasetVersion": "biomedical_graph_v4", "datasetHash": GRAPH_HASH}}))
    (bad / "per_run_metrics.json").write_text("[]")
    with pytest.raises(ValueError, match="unavailable"):
        CandidateRanker(GRAPH, robust_artifact=bad)


def test_offline_ranking_is_deterministic_filters_known_and_never_labels_probability(monkeypatch):
    value = ranker()
    monkeypatch.setattr("app.services.gnn.v4_candidate_ranker.PubMedService", lambda: (_ for _ in ()).throw(AssertionError("network")))
    first, second = value.rank_candidates("CETIRIZINE", 10), value.rank_candidates("CHEMBL:CHEMBL1000", 10)
    assert first == second and len(first) == 10
    assert all(item["candidateStatus"] == "UNOBSERVED_CANDIDATE" and item["provenance"] == "MODEL_PREDICTION" for item in first)
    assert all((first[0]["drug"]["id"], item["disease"]["id"]) not in value.dataset.positive_set for item in first)
    assert all("probability" not in item for item in first)
    assert value.get_known_indications("CETIRIZINE")


def test_structural_support_uses_existing_edges_and_empty_paths_are_not_fabricated():
    value = ranker()
    candidates = value.rank_candidates("CETIRIZINE", 50)
    for candidate in candidates:
        support = candidate["structuralSupport"]
        assert all(any(edge["source"] == relation["source"] and edge["target"] == relation["target"] and edge["relationType"] == relation["relationType"] for edge in value.graph["relations"]) for relation in support["relationIds"])
    empty = next(candidate for candidate in candidates if candidate["structuralSupport"]["sharedTargetCount"] == 0)
    assert empty["structuralSupport"]["sharedTargets"] == [] and empty["structuralSupport"]["pathways"] == []


def test_evidence_enrichment_preserves_source_or_unavailable_contracts():
    value, candidate = ranker(), ranker().rank_candidates("CETIRIZINE", 1)[0]
    class PubMed:
        async def search(self, query, limit): return {"evidence": [{"dataMode": "SOURCE_BACKED", "verificationStatus": "VERIFIED_SOURCE"}]}
    class Trials:
        async def search(self, **kwargs): return {"evidence": [{"dataMode": "SOURCE_BACKED", "verificationStatus": "VERIFIED_SOURCE"}]}
    result = asyncio.run(value.enrich_candidate_evidence(candidate, pubmed_service=PubMed(), clinical_trials_service=Trials()))
    assert result["model"]["architecture"] == "R-GCN" and result["structuralSupport"] == candidate["structuralSupport"]
    assert result["externalEvidence"]["pubmed"]["evidence"][0]["dataMode"] == "SOURCE_BACKED"
    class DownPubMed:
        async def search(self, *args): raise PubMedUnavailable("down")
    class DownTrials:
        async def search(self, **kwargs): raise ClinicalTrialsUnavailable("down")
    unavailable = asyncio.run(value.enrich_candidate_evidence(candidate, pubmed_service=DownPubMed(), clinical_trials_service=DownTrials()))
    assert unavailable["externalEvidence"]["pubmed"]["dataMode"] == "UNAVAILABLE"
    assert unavailable["externalEvidence"]["clinicalTrials"]["dataMode"] == "UNAVAILABLE"
