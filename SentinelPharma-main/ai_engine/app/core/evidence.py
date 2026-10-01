"""Shared, explicit provenance contract for research payloads."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, HttpUrl, model_validator


class DataMode(str, Enum):
    SOURCE_BACKED = "SOURCE_BACKED"
    MODEL_PREDICTION = "MODEL_PREDICTION"
    DEMO_SYNTHETIC = "DEMO_SYNTHETIC"
    UNAVAILABLE = "UNAVAILABLE"


class VerificationStatus(str, Enum):
    VERIFIED_SOURCE = "VERIFIED_SOURCE"
    UNVERIFIED_SOURCE = "UNVERIFIED_SOURCE"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    DEMO_ONLY = "DEMO_ONLY"
    NOT_AVAILABLE = "NOT_AVAILABLE"


EVIDENCE_CONTRACT_VERSION = "1.0"


class EvidenceItem(BaseModel):
    evidenceContractVersion: str = EVIDENCE_CONTRACT_VERSION
    id: Optional[str] = None
    claim: Optional[str] = None
    sourceType: Optional[str] = None
    sourceName: Optional[str] = None
    sourceUrl: Optional[HttpUrl] = None
    sourceId: Optional[str] = None
    retrievedAt: Optional[datetime] = None
    # PubMed may supply only a year or month/year, so preserve the source value verbatim.
    publishedAt: Optional[str] = None
    evidenceType: Optional[str] = None
    dataMode: DataMode
    confidence: Optional[float] = None
    verificationStatus: VerificationStatus
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_provenance(self) -> "EvidenceItem":
        if self.dataMode == DataMode.SOURCE_BACKED:
            if not (self.sourceId or self.sourceUrl) or not self.retrievedAt:
                raise ValueError("SOURCE_BACKED evidence requires a source identifier or URL and retrievedAt")
            if self.verificationStatus not in {
                VerificationStatus.VERIFIED_SOURCE,
                VerificationStatus.UNVERIFIED_SOURCE,
            }:
                raise ValueError("SOURCE_BACKED evidence requires a source verification status")
        expected = {
            DataMode.MODEL_PREDICTION: VerificationStatus.MODEL_INFERENCE,
            DataMode.DEMO_SYNTHETIC: VerificationStatus.DEMO_ONLY,
            DataMode.UNAVAILABLE: VerificationStatus.NOT_AVAILABLE,
        }.get(self.dataMode)
        if expected and self.verificationStatus != expected:
            raise ValueError(f"{self.dataMode.value} evidence requires {expected.value}")
        return self


def unavailable_response(code: str = "SOURCE_NOT_CONFIGURED", message: str = "This research source is not configured.") -> Dict[str, Any]:
    return {
        "success": False,
        "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
        "dataMode": DataMode.UNAVAILABLE.value,
        "verificationStatus": VerificationStatus.NOT_AVAILABLE.value,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "unavailableReason": {"code": code, "message": message},
        "error": {"code": code, "message": message},
    }
