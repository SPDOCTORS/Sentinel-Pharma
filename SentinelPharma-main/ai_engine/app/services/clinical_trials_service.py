"""ClinicalTrials.gov v2 adapter. It preserves source fields and never infers outcomes."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


class ClinicalTrialsUnavailable(Exception):
    pass


class ClinicalTrialsService:
    base_url = "https://clinicaltrials.gov/api/v2/studies"

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self.client = client

    async def search(self, drug: Optional[str] = None, condition: Optional[str] = None, limit: int = 10, query: Optional[str] = None) -> Dict[str, Any]:
        drug, condition, query = (self._clean(value) for value in (drug, condition, query))
        if not any((drug, condition, query)):
            raise ValueError("drug, condition, or query is required")
        limit = max(1, min(limit, settings.CLINICAL_TRIALS_MAX_RESULTS))
        params = {"pageSize": limit, "format": "json"}
        if drug:
            params["query.intr"] = drug
        if condition:
            params["query.cond"] = condition
        if query:
            params["query.term"] = query

        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=settings.CLINICAL_TRIALS_TIMEOUT_SECONDS)
        try:
            response = await client.get(self.base_url, params=params)
            response.raise_for_status()
            payload = response.json()
            studies = payload.get("studies")
            if not isinstance(studies, list):
                raise ClinicalTrialsUnavailable("Malformed ClinicalTrials.gov response")
            retrieved_at = datetime.now(timezone.utc).isoformat()
            return {"drug": drug, "condition": condition, "query": query, "retrievedAt": retrieved_at,
                    "evidence": [self._normalize(study, retrieved_at) for study in studies]}
        except (httpx.HTTPError, ValueError, ClinicalTrialsUnavailable) as exc:
            if isinstance(exc, ValueError) and str(exc) == "drug, condition, or query is required":
                raise
            raise ClinicalTrialsUnavailable(str(exc)) from exc
        finally:
            if owns_client:
                await client.aclose()

    @staticmethod
    def _clean(value: Optional[str]) -> Optional[str]:
        return " ".join(value.split()) if isinstance(value, str) and value.strip() else None

    @staticmethod
    def _get(mapping: Dict[str, Any], *keys: str) -> Any:
        current: Any = mapping
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def _normalize(self, study: Dict[str, Any], retrieved_at: str) -> Dict[str, Any]:
        protocol = study.get("protocolSection")
        if not isinstance(protocol, dict):
            raise ClinicalTrialsUnavailable("Study missing protocol section")
        nct_id = self._get(protocol, "identificationModule", "nctId")
        if not nct_id:
            raise ClinicalTrialsUnavailable("Study missing NCT ID")
        identification = protocol.get("identificationModule", {})
        status = protocol.get("statusModule", {})
        design = protocol.get("designModule", {})
        sponsor = protocol.get("sponsorCollaboratorsModule", {})
        contacts = protocol.get("contactsLocationsModule", {})
        description = protocol.get("descriptionModule", {})
        outcomes = protocol.get("outcomesModule", {})
        arms = protocol.get("armsInterventionsModule", {})
        eligibility = protocol.get("eligibilityModule", {})
        interventions = arms.get("interventions") if isinstance(arms.get("interventions"), list) else None
        conditions = self._get(protocol, "conditionsModule", "conditions")
        phases = design.get("phases") if isinstance(design.get("phases"), list) else None
        return {
            "id": f"NCT:{nct_id}", "claim": identification.get("briefTitle"),
            "sourceType": "CLINICALTRIALS_GOV", "sourceName": "ClinicalTrials.gov", "sourceId": nct_id,
            "sourceUrl": f"https://clinicaltrials.gov/study/{nct_id}", "retrievedAt": retrieved_at,
            "publishedAt": status.get("studyFirstPostDateStruct", {}).get("date") if isinstance(status.get("studyFirstPostDateStruct"), dict) else None,
            "evidenceType": "CLINICAL_TRIAL", "dataMode": "SOURCE_BACKED", "verificationStatus": "VERIFIED_SOURCE",
            "metadata": {
                "officialTitle": identification.get("officialTitle"), "overallStatus": status.get("overallStatus"),
                "studyType": design.get("studyType"), "phases": phases, "conditions": conditions,
                "interventions": interventions, "leadSponsor": sponsor.get("leadSponsor"), "collaborators": sponsor.get("collaborators"),
                "enrollment": self._get(design, "enrollmentInfo", "count"), "startDate": self._get(status, "startDateStruct", "date"),
                "completionDate": self._get(status, "completionDateStruct", "date"), "locations": contacts.get("locations"),
                "eligibilitySummary": eligibility.get("eligibilityCriteria"), "primaryOutcomes": outcomes.get("primaryOutcomes"),
                "secondaryOutcomes": outcomes.get("secondaryOutcomes"), "hasResults": study.get("hasResults"),
                "lastUpdateDate": self._get(status, "lastUpdatePostDateStruct", "date"), "briefSummary": description.get("briefSummary"),
            },
        }
