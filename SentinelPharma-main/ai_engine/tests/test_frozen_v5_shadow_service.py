from pathlib import Path

import pytest

from app.services.gnn.frozen_v5_shadow_service import (
    V5_DATASET_HASH,
    V5_DATASET_VERSION,
    FrozenV5ShadowService,
)


ROOT = Path(__file__).parents[1]


@pytest.fixture(scope="module")
def service():
    return FrozenV5ShadowService(ROOT)


def test_v5_shadow_ranks_drugs_for_exact_disease_and_preserves_lineage(service):
    result = service.predict("EFO:0003956", 5)

    assert result["model"] == "frozen-v5-rgcn-shadow"
    assert result["diseaseEntity"] == {
        "id": "EFO:0003956",
        "name": "seasonal allergic rhinitis",
        "entityType": "DISEASE",
    }
    assert result["metadata"]["shadow"] is True
    assert result["metadata"]["primary"] is False
    assert result["modelLineage"]["graphDatasetVersion"] == V5_DATASET_VERSION
    assert result["modelLineage"]["graphDatasetHash"] == V5_DATASET_HASH
    assert result["modelLineage"]["checkpointHash"]
    assert len(result["candidates"]) == 5
    assert all(row["provenance"]["dataMode"] == "MODEL_PREDICTION" for row in result["candidates"])
    assert all(row["provenance"]["verificationStatus"] == "MODEL_INFERENCE" for row in result["candidates"])
    # Cetirizine is a source-backed known indication for this disease and must
    # not reappear in the unobserved candidate universe.
    assert "CHEMBL:CHEMBL1000" not in {row["drugId"] for row in result["candidates"]}


def test_v5_shadow_disease_resolution_is_exact_and_fail_closed(service):
    by_name = service.predict("Seasonal Allergic Rhinitis", 2)
    by_id = service.predict("EFO:0003956", 2)
    assert [row["drugId"] for row in by_name["candidates"]] == [row["drugId"] for row in by_id["candidates"]]

    with pytest.raises(ValueError, match="Unknown or ambiguous disease identifier"):
        service.predict("allergic", 2)
