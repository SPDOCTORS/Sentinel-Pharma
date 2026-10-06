from pathlib import Path

from app.services.gnn.v5_evidence_graph_service import MAX_PATHWAYS, MAX_TARGETS, V5EvidenceGraphService


ROOT = Path(__file__).parents[1]


def test_v5_live_graph_is_bounded_source_backed_and_preserves_relation_provenance():
    result = V5EvidenceGraphService(ROOT).subgraph("Telmisartan", "diabetes mellitus")

    assert result["dataMode"] == "SOURCE_BACKED"
    assert result["verificationStatus"] == "VERIFIED_SOURCE"
    assert result["graphDatasetVersion"] == "biomedical_graph_v5"
    assert result["focus"] == {"drugId": "CHEMBL:CHEMBL1017", "diseaseId": "EFO:0000400"}
    assert len([node for node in result["nodes"] if node["type"] == "TARGET"]) <= MAX_TARGETS
    assert len([node for node in result["nodes"] if node["type"] == "PATHWAY"]) <= MAX_PATHWAYS
    assert {edge["type"] for edge in result["edges"]} >= {"DRUG_TARGET", "DISEASE_TARGET"}
    assert all(node["provenance"] for node in result["nodes"])
    assert all(edge["provenance"] for edge in result["edges"])
    assert {item["source"] for edge in result["edges"] for item in edge["provenance"]} >= {"ChEMBL", "OpenTargets"}


def test_v5_live_graph_fails_closed_without_an_exact_connected_neighborhood():
    service = V5EvidenceGraphService(ROOT)

    missing_drug = service.subgraph_or_unavailable("not a V5 drug", "diabetes mellitus")
    disconnected_pair = service.subgraph_or_unavailable("Cetirizine", "diabetes mellitus")

    for result in (missing_drug, disconnected_pair):
        assert result["dataMode"] == "UNAVAILABLE"
        assert result["verificationStatus"] == "NOT_AVAILABLE"
        assert result["nodes"] == []
        assert result["edges"] == []
        assert result["unavailableReason"]["code"] == "V5_GRAPH_EVIDENCE_UNAVAILABLE"
