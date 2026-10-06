from pathlib import Path

from app.services.gnn.repurposing_gnn_service import GNNRepurposingService


ROOT = Path(__file__).parents[1]


def verified_row():
    return {
        "source": "Candidate A",
        "source_type": "drug",
        "relation": "targets",
        "target": "TARGET1",
        "target_type": "target",
        "pdb_id": "4ABC",
        "structure_mapping": {
            "pdbId": "4ABC",
            "drug": "Candidate A",
            "target": "TARGET1",
            "dataMode": "SOURCE_BACKED",
            "verificationStatus": "VERIFIED_SOURCE",
            "mappingStatus": "VERIFIED",
            "mappingMethod": "VERIFIED_DRUG_TARGET_COMPLEX",
            "provenance": {
                "source": "RCSB PDB",
                "sourceRecordId": "4ABC",
                "sourceUrl": "https://www.rcsb.org/structure/4ABC",
                "retrievedAt": "2026-10-05T00:00:00Z",
            },
        },
    }


def test_bare_pdb_id_is_not_a_verified_structure_mapping():
    row = verified_row()
    row["structure_mapping"] = None

    assert GNNRepurposingService._verified_structure_mapping(row) is None


def test_verified_mapping_requires_exact_drug_target_identity_and_provenance():
    accepted = GNNRepurposingService._verified_structure_mapping(verified_row())
    assert accepted["pdbId"] == "4ABC"
    assert accepted["provenance"]["sourceRecordId"] == "4ABC"

    wrong_target = verified_row()
    wrong_target["structure_mapping"]["target"] = "OTHER_TARGET"
    assert GNNRepurposingService._verified_structure_mapping(wrong_target) is None

    missing_retrieval = verified_row()
    del missing_retrieval["structure_mapping"]["provenance"]["retrievedAt"]
    assert GNNRepurposingService._verified_structure_mapping(missing_retrieval) is None


def test_missing_verified_mapping_returns_unavailable_without_a_pdb_id():
    service = object.__new__(GNNRepurposingService)
    service.verified_structures = {}

    result = service._structure_interaction("Candidate A", "TARGET1")

    assert result["dataMode"] == "UNAVAILABLE"
    assert result["verificationStatus"] == "NOT_AVAILABLE"
    assert result["unavailableReason"]["code"] == "VERIFIED_STRUCTURE_MAPPING_UNAVAILABLE"
    assert "pdbId" not in result


def test_legacy_artifact_pdb_ids_are_not_returned_as_verified_candidate_structures():
    result = GNNRepurposingService(ROOT).predict("Type 2 Diabetes", 3)

    assert len(result["candidates"]) == 3
    assert all(candidate["interaction"]["dataMode"] == "UNAVAILABLE" for candidate in result["candidates"])
    assert all("pdbId" not in candidate["interaction"] for candidate in result["candidates"])
