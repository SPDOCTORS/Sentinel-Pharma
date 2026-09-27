import httpx
import pytest

from app.services.clinical_trials_service import ClinicalTrialsService, ClinicalTrialsUnavailable


STUDY = {"hasResults": True, "protocolSection": {
  "identificationModule": {"nctId": "NCT01234567", "briefTitle": "Metformin study", "officialTitle": "Official metformin study"},
  "statusModule": {"overallStatus": "COMPLETED", "startDateStruct": {"date": "2020-01-01"}},
  "designModule": {"studyType": "INTERVENTIONAL", "phases": ["PHASE2"], "enrollmentInfo": {"count": 42}},
  "conditionsModule": {"conditions": ["Pancreatic Cancer"]},
  "armsInterventionsModule": {"interventions": [{"name": "Metformin", "type": "DRUG"}]},
  "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Example University"}}
}}

class Response:
    def __init__(self, payload): self.payload = payload
    def json(self): return self.payload
    def raise_for_status(self): return None

class Client:
    def __init__(self, response): self.response = response
    async def get(self, *_args, **_kwargs):
        if isinstance(self.response, Exception): raise self.response
        return self.response

@pytest.mark.asyncio
async def test_trial_is_normalized_without_missing_field_invention():
    result = await ClinicalTrialsService(Client(Response({"studies": [STUDY]}))).search("metformin", "pancreatic cancer")
    trial = result["evidence"][0]
    assert trial["sourceId"] == "NCT01234567"
    assert trial["dataMode"] == "SOURCE_BACKED"
    assert trial["verificationStatus"] == "VERIFIED_SOURCE"
    assert trial["metadata"]["completionDate"] is None
    assert trial["metadata"]["hasResults"] is True

@pytest.mark.asyncio
async def test_zero_trials_is_successful_empty_result():
    result = await ClinicalTrialsService(Client(Response({"studies": []}))).search("metformin")
    assert result["evidence"] == []

@pytest.mark.asyncio
async def test_timeout_and_malformed_data_are_unavailable():
    for response in [httpx.TimeoutException("timeout"), Response({"studies": {}})]:
        with pytest.raises(ClinicalTrialsUnavailable):
            await ClinicalTrialsService(Client(response)).search("metformin")
