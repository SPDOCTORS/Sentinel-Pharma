from pathlib import Path

from app.services.gnn.v4_candidate_ranker import CandidateRanker
from app.services.gnn.v4_ranking_diagnostic import audit_ranker


GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"


def test_diagnostic_is_read_only_and_score_frequency_is_complete():
    ranker = CandidateRanker(GRAPH)
    before = ranker.rank_candidates("CETIRIZINE", 10)
    report = audit_ranker(ranker)
    after = ranker.rank_candidates("CETIRIZINE", 10)
    assert before == after
    distribution = report["scoreDistribution"]
    assert sum(item["count"] for item in distribution["frequency"]) == distribution["candidateCount"]
    assert distribution["largestTieGroup"] >= 1


def test_diagnostic_relations_and_feature_collision_are_grounded_in_selected_graph():
    report = audit_ranker(CandidateRanker(GRAPH))
    assert report["cetirizine"]["nodeIndex"] >= 0
    assert report["coverage"]["diseasesTotal"] > 0
    assert report["featureCollision"]["uniqueDiseaseFeatureVectors"] <= report["coverage"]["diseasesTotal"]
    assert all(row["diseaseTargetCount"] == row["degreeByRelationType"]["DISEASE_TARGET"]["incoming"] for row in report["top10DiseaseAudit"])
