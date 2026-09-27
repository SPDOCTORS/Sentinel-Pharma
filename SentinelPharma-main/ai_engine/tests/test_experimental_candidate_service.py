from pathlib import Path

from app.services.gnn.experimental_candidate_service import ExperimentalCandidateService


ROOT = Path(__file__).parents[1]
V4 = ROOT / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
V5 = ROOT / "artifacts/biomedical_graph/phase2p/biomedical_graph_v5_20260924T052339Z/graph.json"
ROBUST = ROOT / "artifacts/gnn/evaluations/v4_rgcn_robust_20260921T084017Z"


def test_v5_evidence_is_post_ranking_and_cannot_change_v4_scores(monkeypatch):
    monkeypatch.setattr("httpx.Client", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network")))
    service = ExperimentalCandidateService(V4, V5, ROBUST)
    direct = service.ranker.rank_candidates("CETIRIZINE", 10)
    enriched = service.rank_candidates("CETIRIZINE", 10)
    assert [row["disease"]["id"] for row in direct] == [row["candidate"]["disease"]["id"] for row in enriched]
    assert [row["modelScore"] for row in direct] == [row["candidate"]["modelScore"] for row in enriched]
    assert all(row["candidate"]["provenance"] == "MODEL_PREDICTION" for row in enriched)
    assert all("probability" not in row["model"]["scoreSemantics"].lower() or "not probability" in row["model"]["scoreSemantics"].lower() for row in enriched)
    assert all(row["structuralEvidence"]["graphDatasetVersion"] == "biomedical_graph_v5" for row in enriched)
