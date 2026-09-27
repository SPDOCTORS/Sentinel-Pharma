"""Shared, explicit provenance contract for research payloads."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, HttpUrl


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


class EvidenceItem(BaseModel):
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


def unavailable_response(code: str = "SOURCE_NOT_CONFIGURED", message: str = "This research source is not configured.") -> Dict[str, Any]:
    return {
        "success": False,
        "dataMode": DataMode.UNAVAILABLE.value,
        "error": {"code": code, "message": message},
    }
