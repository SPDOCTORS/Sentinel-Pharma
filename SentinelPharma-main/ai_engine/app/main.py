"""
SentinelPharma AI Engine - Main Application
========================================
FastAPI entry point for the Multi-Agent Drug Repurposing System.

This engine provides:
- Multi-agent orchestration (Clinical, Patent, Market, Vision)
- Hybrid processing mode (Cloud Gemini / Local Llama 3)
- Knowledge Graph integration
- ROI calculation endpoints
"""

import os
import random
import secrets
import json
from datetime import datetime
from typing import Any, List, Optional
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import structlog
import logging

# Configure standard logging
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO
)

# Configure structured logging with simpler configuration
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True
)

logger = structlog.get_logger(__name__)

# Import agents
from app.agents.clinical_agent import ClinicalAgent
from app.agents.patent_agent import PatentAgent
from app.agents.vision_agent import VisionAgent
from app.agents.validation_agent import ValidationAgent
from app.agents.iqvia_agent import IQVIAInsightsAgent
from app.agents.exim_agent import EXIMAgent
from app.agents.web_intelligence_agent import WebIntelligenceAgent
from app.agents.internal_knowledge_agent import InternalKnowledgeAgent
from app.agents.regulatory_agent import RegulatoryAgent
from app.agents.patient_sentiment_agent import PatientSentimentAgent
from app.agents.orchestrator import MasterOrchestrator
from app.core.config import settings
from app.core.evidence import EVIDENCE_CONTRACT_VERSION, unavailable_response
from app.core.privacy_toggle import PrivacyManager
from app.services.gnn import GNNRepurposingService
from app.services.gnn.experimental_candidate_service import ExperimentalCandidateService
from app.services.pubmed_service import PubMedService, PubMedUnavailable
from app.services.clinical_trials_service import ClinicalTrialsService, ClinicalTrialsUnavailable
from app.services.research_workflow import analyze_live_research


# ======================
# PYDANTIC MODELS
# ======================

class AnalyzeRequest(BaseModel):
    """Request model for compound analysis"""
    molecule: str = Field(..., min_length=2, max_length=200, description="Name of the drug/compound")
    mode: str = Field(default="auto", pattern="^(secure|cloud|auto)$", description="Processing mode: auto (detect best), secure (force local), cloud (any cloud provider)")
    provider: Optional[str] = Field(None, pattern="^(ollama|gemini)$", description="Specific LLM provider: ollama (llama3), gemini (gemini-1.5-flash)")
    request_id: str = Field(..., description="Unique request identifier")
    disease: Optional[str] = Field(default=None, min_length=2, max_length=200)
    research_mode: str = Field(default="live", pattern="^(live|demo)$")
    agents: Optional[List[str]] = Field(
        default=[
            "clinical",
            "patent",
            "iqvia",
            "vision",
            "exim",
            "web_intelligence",
            "internal_knowledge",
            "regulatory",
            "patient_sentiment",
            "esg",
        ],
        description="List of agents to engage"
    )


class OrchestratedRequest(BaseModel):
    """Request model for orchestrated multi-agent analysis"""
    query: str = Field(..., min_length=5, description="Natural language research query")
    molecule: Optional[str] = Field(None, description="Specific molecule name if applicable")
    disease: Optional[str] = Field(None, description="Target disease if applicable")
    mode: str = Field(default="auto", pattern="^(secure|cloud|auto)$", description="Processing mode: auto (detect best), secure (force local), cloud (any cloud provider)")
    provider: Optional[str] = Field(None, pattern="^(ollama|gemini)$", description="Specific LLM provider: ollama (llama3), gemini (gemini-1.5-flash)")
    request_id: str = Field(..., description="Unique request identifier")


class ROIRequest(BaseModel):
    """Request model for ROI calculation"""
    molecule: str = Field(..., min_length=2, description="Name of the drug/compound")
    request_id: str = Field(..., description="Unique request identifier")


class PubMedSearchRequest(BaseModel):
    """Controlled literature query for the source-backed PubMed adapter."""
    query: str = Field(..., min_length=2, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)


class ClinicalTrialsSearchRequest(BaseModel):
    """Controlled ClinicalTrials.gov search; at least one search term is required."""
    drug: Optional[str] = Field(default=None, max_length=200)
    condition: Optional[str] = Field(default=None, max_length=200)
    query: Optional[str] = Field(default=None, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)


class EXIMRequest(BaseModel):
    """Request for EXIM trade intelligence analysis"""
    molecule: str = Field(..., min_length=2, description="Molecule/API name")
    region: str = Field(default="global", description="Target region for analysis")
    request_id: str = Field(..., description="Unique request identifier")


class IQVIARequest(BaseModel):
    """Request for IQVIA market intelligence analysis"""
    molecule: str = Field(..., min_length=2, description="Molecule name")
    disease: str = Field(..., min_length=2, description="Target disease indication")
    request_id: str = Field(..., description="Unique request identifier")


class WebIntelRequest(BaseModel):
    """Request for web intelligence gathering"""
    query: str = Field(..., min_length=3, description="Search query")
    sources: list[str] = Field(default=["pubmed", "news", "regulatory"], description="Sources to search")
    request_id: str = Field(..., description="Unique request identifier")


class InternalKnowledgeRequest(BaseModel):
    """Request for internal knowledge base search"""
    query: str = Field(..., min_length=3, description="Search query")
    document_types: list[str] = Field(default=["all"], description="Document types to search")
    request_id: str = Field(..., description="Unique request identifier")


class GNNTrainRequest(BaseModel):
    """Request model for GNN training."""
    dataset_path: Optional[str] = Field(
        default=None,
        description="Optional CSV path for DrugBank-style KG triples"
    )
    epochs: int = Field(default=120, ge=10, le=1000)
    learning_rate: float = Field(default=0.01, gt=0.00001, le=0.1)
    hidden_dim: int = Field(default=64, ge=16, le=512)
    embedding_dim: int = Field(default=64, ge=16, le=512)


class GNNEvaluateRequest(BaseModel):
    """Request model for held-out evaluation."""
    dataset_path: Optional[str] = Field(
        default=None,
        description="Optional CSV path for DrugBank-style KG triples"
    )
    holdout_ratio: float = Field(default=0.3, gt=0.05, lt=0.8)
    epochs: int = Field(default=80, ge=10, le=500)
    learning_rate: float = Field(default=0.01, gt=0.00001, le=0.1)
    hidden_dim: int = Field(default=64, ge=16, le=512)
    embedding_dim: int = Field(default=64, ge=16, le=512)


class GNNRepurposeRequest(BaseModel):
    """Request model for disease-first repurposing prediction."""
    disease: str = Field(..., min_length=2, max_length=200)
    top_k: int = Field(default=5, ge=1, le=20)


class KGRelation(BaseModel):
    """Single KG relation for online updates."""
    source: str = Field(..., min_length=1)
    source_type: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    target_type: str = Field(..., min_length=1)
    pdb_id: Optional[str] = None


class GNNOnlineUpdateRequest(BaseModel):
    """Request model for online updates with new KG relations."""
    relations: List[KGRelation] = Field(..., min_length=1)
    epochs: int = Field(default=25, ge=5, le=300)


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    version: str
    timestamp: str
    mode_available: dict


class ExperimentalEvidenceRequest(BaseModel):
    """Explicit external-evidence request for an experimental candidate."""
    drug_id: str = Field(..., min_length=1, max_length=200)
    disease_id: str = Field(..., min_length=1, max_length=200)


class ExperimentalEntity(BaseModel):
    id: str
    name: Optional[str] = None
    entityType: Optional[str] = None


class ExperimentalCandidatePrediction(BaseModel):
    drug: ExperimentalEntity
    disease: ExperimentalEntity
    rank: int
    modelScore: float
    candidateStatus: str
    provenance: str


class ExperimentalModelLineage(BaseModel):
    architecture: str
    graphDatasetVersion: str
    graphDatasetHash: str
    checkpointHash: str
    scoreSemantics: str


class ExperimentalStructuralEvidence(BaseModel):
    lookupStatus: str
    supportStatus: str
    graphDatasetVersion: Optional[str] = None
    graphDatasetHash: Optional[str] = None
    sharedTargets: list[ExperimentalEntity] = Field(default_factory=list)
    sharedTargetCount: int = 0
    pathways: list[ExperimentalEntity] = Field(default_factory=list)
    sources: list[Any] = Field(default_factory=list)
    reason: Optional[str] = None


class ExperimentalExternalEvidence(BaseModel):
    pubmed: dict[str, Any]
    clinicalTrials: dict[str, Any]


class ExperimentalCandidateResult(BaseModel):
    evidenceContractVersion: str = EVIDENCE_CONTRACT_VERSION
    dataMode: str = "MODEL_PREDICTION"
    verificationStatus: str = "MODEL_INFERENCE"
    candidate: ExperimentalCandidatePrediction
    model: ExperimentalModelLineage
    structuralEvidence: ExperimentalStructuralEvidence
    externalEvidence: ExperimentalExternalEvidence
    limitations: list[str]


class ExperimentalCandidateRankingResponse(BaseModel):
    evidenceContractVersion: str = EVIDENCE_CONTRACT_VERSION
    dataMode: str = "MODEL_PREDICTION"
    verificationStatus: str = "MODEL_INFERENCE"
    experimental: bool
    drug: ExperimentalEntity
    candidateCount: int
    candidates: list[ExperimentalCandidateResult]
    model: ExperimentalModelLineage
    structuralGraph: dict[str, str]
    limitations: list[str]


class ExperimentalKnownIndication(BaseModel):
    drug: ExperimentalEntity
    disease: ExperimentalEntity
    candidateStatus: str
    relationId: dict[str, str]
    provenance: list[Any]


class ExperimentalKnownIndicationsResponse(BaseModel):
    evidenceContractVersion: str = EVIDENCE_CONTRACT_VERSION
    dataMode: str = "SOURCE_BACKED"
    verificationStatus: str = "UNVERIFIED_SOURCE"
    experimental: bool
    drug: ExperimentalEntity
    indicationCount: int
    indications: list[ExperimentalKnownIndication]
    limitations: list[str]


# ======================
# APPLICATION LIFECYCLE
# ======================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager"""
    logger.info("Starting SentinelPharma AI Engine", version=settings.VERSION)
    logger.info("Privacy modes available", cloud=settings.CLOUD_ENABLED, 
                local=settings.LOCAL_ENABLED)
    
    # Initialize core agents
    app.state.clinical_agent = ClinicalAgent()
    app.state.patent_agent = PatentAgent()
    app.state.vision_agent = VisionAgent()
    app.state.privacy_manager = PrivacyManager()
    
    # Initialize validation and new agents
    app.state.validation_agent = ValidationAgent()
    app.state.regulatory_agent = RegulatoryAgent()
    app.state.patient_sentiment_agent = PatientSentimentAgent()
    
    # Initialize mandatory domain expert agents
    app.state.exim_agent = EXIMAgent()
    app.state.iqvia_agent = IQVIAInsightsAgent()
    app.state.web_intel_agent = WebIntelligenceAgent()
    app.state.internal_knowledge_agent = InternalKnowledgeAgent()
    
    # Initialize orchestrator (creates its own agent instances)
    app.state.orchestrator = MasterOrchestrator()

    # Initialize DrugBank + PyG repurposing service.
    app.state.gnn_repurposing = GNNRepurposingService(Path(__file__).resolve().parents[1])
    
    logger.info("All agents initialized successfully (10 core agents + orchestrator)")
    
    yield
    
    logger.info("Shutting down SentinelPharma AI Engine")


# ======================
# FASTAPI APPLICATION
# ======================

app = FastAPI(
    title="SentinelPharma AI Engine",
    description="Multi-Agent Drug Repurposing AI System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)


# The experimental service is deliberately lazy: application startup and all
# unrelated endpoints remain independent of the frozen research artifacts.
_experimental_candidate_service: ExperimentalCandidateService | None = None
_EXPERIMENTAL_V4_GRAPH = Path(__file__).resolve().parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
_EXPERIMENTAL_V5_GRAPH = Path(__file__).resolve().parents[1] / "artifacts/biomedical_graph/phase2p/biomedical_graph_v5_20260924T052339Z/graph.json"
_EXPERIMENTAL_V4_ROBUST = Path(__file__).resolve().parents[1] / "artifacts/gnn/evaluations/v4_rgcn_robust_20260921T084017Z"


def _get_experimental_candidate_service() -> ExperimentalCandidateService:
    """Load the fixed V4 ranker and V5 evidence graph without downloading data."""
    global _experimental_candidate_service
    if _experimental_candidate_service is None:
        _experimental_candidate_service = ExperimentalCandidateService(
            _EXPERIMENTAL_V4_GRAPH,
            _EXPERIMENTAL_V5_GRAPH,
            _EXPERIMENTAL_V4_ROBUST,
        )
    return _experimental_candidate_service


def _experimental_structural_evidence(value: dict[str, Any]) -> dict[str, Any]:
    """Expose lookup availability separately from actual V5 structural support."""
    lookup_status = value.get("status", "UNAVAILABLE")
    available = lookup_status == "AVAILABLE"
    has_support = bool(value.get("sharedTargetCount", 0) or value.get("pathways", []))
    return {
        "lookupStatus": "AVAILABLE" if available else "UNAVAILABLE",
        "supportStatus": "SUPPORTED" if available and has_support else ("NO_STRUCTURAL_SUPPORT" if available else "UNAVAILABLE"),
        "graphDatasetVersion": value.get("graphDatasetVersion"),
        "graphDatasetHash": value.get("graphDatasetHash"),
        "sharedTargets": value.get("sharedTargets", []),
        "sharedTargetCount": value.get("sharedTargetCount", 0),
        "pathways": value.get("pathways", []),
        "sources": value.get("sources", []),
        "reason": value.get("reason"),
    }


def _experimental_result(value: dict[str, Any]) -> dict[str, Any]:
    """Map the internal service shape to the public, typed experimental contract."""
    return {
        "candidate": value["candidate"],
        "model": value["model"],
        "structuralEvidence": _experimental_structural_evidence(value["structuralEvidence"]),
        "externalEvidence": value["externalEvidence"],
        "limitations": [
            *value["limitations"],
            "MODEL_PREDICTION is experimental and is not verified biomedical evidence.",
            "A modelScore is not a probability, confidence, likelihood, or clinical score.",
            "NO_STRUCTURAL_SUPPORT does not establish ineffectiveness; structural support does not establish therapeutic efficacy.",
            "This API is not clinical advice.",
        ],
    }


def _experimental_http_error(error: ValueError) -> HTTPException:
    """Return public-safe errors without exposing local artifact details."""
    message = str(error).lower()
    if "unknown or ambiguous drug" in message or "drug_id is required" in message:
        return HTTPException(status_code=404, detail="Experimental drug was not found.")
    if "known indication" in message or "not a v4 disease" in message:
        return HTTPException(status_code=404, detail="Experimental candidate was not found.")
    logger.warning("experimental_candidate_service_unavailable", reason=str(error))
    return HTTPException(status_code=503, detail="Experimental candidate service is unavailable.")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================
# MIDDLEWARE
# ======================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    start_time = datetime.now()
    
    response = await call_next(request)
    
    duration = (datetime.now() - start_time).total_seconds() * 1000
    logger.info(
        "request_processed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration, 2)
    )
    
    return response


@app.middleware("http")
async def require_internal_service_token(request: Request, call_next):
    """Protect every non-public AI endpoint behind the Express service boundary."""
    public_paths = {"/", "/health", "/docs", "/openapi.json", "/redoc"}
    if request.url.path in public_paths or request.url.path.startswith("/docs/"):
        return await call_next(request)

    expected = settings.INTERNAL_SERVICE_TOKEN
    provided = request.headers.get("X-Internal-Service-Token", "")
    if not expected or not secrets.compare_digest(provided, expected):
        return JSONResponse(
            status_code=401,
            content=unavailable_response(
                "INTERNAL_AUTH_REQUIRED",
                "Internal service authentication required",
            ),
        )
    return await call_next(request)


@app.middleware("http")
async def block_synthetic_research_in_production(request: Request, call_next):
    """The existing agent implementations are demos until source adapters exist."""
    synthetic_paths = (
        "/api/orchestrate",
        "/api/agents/",
    )
    is_gnn = request.url.path.startswith("/api/gnn/")
    is_synthetic_route = not is_gnn and request.url.path.startswith(synthetic_paths)
    if not settings.DEMO_MODE and is_synthetic_route:
        return JSONResponse(status_code=503, content=unavailable_response())
    response = await call_next(request)
    if settings.DEMO_MODE and is_synthetic_route and response.headers.get("content-type", "").startswith("application/json"):
        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            payload = json.loads(body)
            if isinstance(payload, dict):
                payload.setdefault("dataMode", "DEMO_SYNTHETIC")
                payload.setdefault("verificationStatus", "DEMO_ONLY")
                payload.setdefault("evidenceContractVersion", EVIDENCE_CONTRACT_VERSION)
                payload.setdefault("generatedAt", datetime.now().astimezone().isoformat())
                return JSONResponse(status_code=response.status_code, content=payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return response


# ======================
# API ENDPOINTS
# ======================

@app.get("/")
async def root():
    """Root endpoint for quick service discovery."""
    return {
        "status": "healthy",
        "service": "sentinelpharma-ai-engine",
        "version": settings.VERSION,
        "message": "SentinelPharma AI Engine is running",
        "endpoints": {
            "health": "/health",
            "analyze": "/api/analyze",
            "gnn_train": "/api/gnn/train",
            "gnn_repurpose": "/api/gnn/repurpose",
            "gnn_online_update": "/api/gnn/online-update",
            "docs": "/docs"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint for service monitoring.
    Returns current service status and available modes.
    """
    return HealthResponse(
        status="healthy",
        service="sentinelpharma-ai-engine",
        version=settings.VERSION,
        timestamp=datetime.now().isoformat(),
        mode_available={
            "cloud": settings.CLOUD_ENABLED,
            "local": settings.LOCAL_ENABLED
        }
    )


@app.post("/api/evidence/pubmed/search")
async def search_pubmed_evidence(request: PubMedSearchRequest):
    """Retrieve publication metadata from PubMed without inferring scientific validity."""
    try:
        result = await PubMedService().search(request.query, request.limit)
        return {
            "success": True,
            "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
            "dataMode": "SOURCE_BACKED",
            "verificationStatus": "VERIFIED_SOURCE",
            "source": "PubMed",
            "query": result["query"],
            "retrievedAt": result["retrievedAt"],
            "count": len(result["evidence"]),
            "evidence": result["evidence"],
        }
    except PubMedUnavailable:
        return JSONResponse(
            status_code=503,
            content=unavailable_response(
                "PUBMED_UNAVAILABLE",
                "PubMed evidence retrieval is currently unavailable.",
            ),
        )


@app.post("/api/evidence/clinical-trials/search")
async def search_clinical_trials_evidence(request: ClinicalTrialsSearchRequest):
    """Retrieve study metadata only; neither study status nor existence implies efficacy."""
    try:
        result = await ClinicalTrialsService().search(request.drug, request.condition, request.limit, request.query)
        return {
            "success": True, "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
            "dataMode": "SOURCE_BACKED", "verificationStatus": "VERIFIED_SOURCE",
            "source": "ClinicalTrials.gov", "drug": result["drug"], "condition": result["condition"],
            "query": result["query"], "retrievedAt": result["retrievedAt"],
            "count": len(result["evidence"]), "evidence": result["evidence"],
        }
    except ClinicalTrialsUnavailable:
        return JSONResponse(status_code=503, content=unavailable_response(
            "CLINICAL_TRIALS_UNAVAILABLE", "ClinicalTrials.gov evidence retrieval is currently unavailable."))


_EXPERIMENTAL_TAG = "Experimental Drug Repurposing"
_EXPERIMENTAL_LIMITATIONS = [
    "Experimental output only; it is not clinical decision support or clinical advice.",
    "MODEL_PREDICTION is not verified biomedical evidence, and modelScore is not a probability.",
    "Structural support does not establish therapeutic efficacy; no structural support does not establish ineffectiveness.",
    "The absence of PubMed or ClinicalTrials.gov results does not establish ineffectiveness.",
]


@app.get(
    "/api/experimental/repurposing/drugs/{drug_id}/candidates",
    response_model=ExperimentalCandidateRankingResponse,
    tags=[_EXPERIMENTAL_TAG],
    summary="Rank experimental unobserved candidates using the frozen V4 R-GCN",
    description=(
        "Returns only UNOBSERVED_CANDIDATE entries with MODEL_PREDICTION provenance. "
        "modelScore is an experimental model score, not a probability. V5 structural evidence is reported "
        "separately; NO_STRUCTURAL_SUPPORT means a successful lookup found no shared targets or pathways."
    ),
)
async def rank_experimental_candidates(
    drug_id: str,
    top_k: int = Query(default=10, ge=1, le=50, description="Number of experimental candidates, from 1 through 50."),
):
    """Offline ranking only; this endpoint does not invoke source adapters or HTTP clients."""
    try:
        results = [_experimental_result(item) for item in _get_experimental_candidate_service().rank_candidates(drug_id, top_k)]
    except ValueError as error:
        raise _experimental_http_error(error) from None
    drug = results[0]["candidate"]["drug"]
    return {
        "experimental": True,
        "drug": drug,
        "candidateCount": len(results),
        "candidates": results,
        "model": results[0]["model"],
        "structuralGraph": {
            "graphDatasetVersion": "biomedical_graph_v5",
            "graphDatasetHash": "9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90",
        },
        "limitations": _EXPERIMENTAL_LIMITATIONS,
    }


@app.get(
    "/api/experimental/repurposing/drugs/{drug_id}/candidates/{disease_id}",
    response_model=ExperimentalCandidateResult,
    tags=[_EXPERIMENTAL_TAG],
    summary="Read an offline experimental candidate and its separate V5 structural evidence",
    description="MODEL_PREDICTION and V5 structural evidence remain separate. This endpoint performs no external evidence retrieval.",
)
async def get_experimental_candidate_detail(drug_id: str, disease_id: str):
    try:
        return _experimental_result(_get_experimental_candidate_service().get_candidate_details(drug_id, disease_id))
    except ValueError as error:
        raise _experimental_http_error(error) from None


@app.get(
    "/api/experimental/repurposing/drugs/{drug_id}/known-indications",
    response_model=ExperimentalKnownIndicationsResponse,
    tags=[_EXPERIMENTAL_TAG],
    summary="Read source-backed known indications separately from experimental candidates",
    description="Known indications are excluded from MODEL_PREDICTION ranking and retain their frozen source-backed provenance.",
)
async def get_experimental_known_indications(drug_id: str):
    try:
        indications = _get_experimental_candidate_service().get_known_indications(drug_id)
    except ValueError as error:
        raise _experimental_http_error(error) from None
    drug = indications[0]["drug"] if indications else {"id": drug_id, "name": drug_id, "entityType": "DRUG"}
    return {
        "experimental": True,
        "drug": drug,
        "indicationCount": len(indications),
        "indications": indications,
        "limitations": _EXPERIMENTAL_LIMITATIONS,
    }


@app.post(
    "/api/experimental/repurposing/evidence",
    response_model=ExperimentalCandidateResult,
    tags=[_EXPERIMENTAL_TAG],
    summary="Explicitly enrich one experimental candidate with external evidence metadata",
    description="This is the only experimental-repurposing endpoint that may call PubMed and ClinicalTrials.gov. Unavailable sources remain UNAVAILABLE and are never synthesized.",
)
async def enrich_experimental_candidate_evidence(request: ExperimentalEvidenceRequest):
    try:
        result = await _get_experimental_candidate_service().enrich_candidate_evidence(request.drug_id, request.disease_id)
        return _experimental_result(result)
    except ValueError as error:
        raise _experimental_http_error(error) from None


@app.post("/api/analyze")
async def analyze_compound(request: AnalyzeRequest):
    """
    Main analysis endpoint - orchestrates all agents.
    
    This endpoint:
    1. Validates the processing mode (secure/cloud)
    2. Dispatches requests to selected agents
    3. Aggregates results from all agents
    4. Returns comprehensive analysis
    
    Args:
        request: AnalyzeRequest containing molecule name, mode, and agent selection
        
    Returns:
        Aggregated analysis from all agents including ROI calculations
    """
    if request.research_mode == "live":
        if request.mode == "secure":
            return JSONResponse(
                status_code=422,
                content=unavailable_response(
                    "LIVE_RETRIEVAL_REQUIRES_CLOUD_MODE",
                    "Live PubMed and ClinicalTrials.gov retrieval requires cloud mode.",
                ),
            )
        return await analyze_live_research(
            request.molecule, request.disease, request.request_id, app.state.gnn_repurposing
        )
    if not settings.DEMO_MODE:
        return JSONResponse(
            status_code=503,
            content=unavailable_response("DEMO_DISABLED", "Synthetic demonstration mode is disabled."),
        )

    logger.info(
        "analyze_request_received",
        molecule=request.molecule,
        mode=request.mode,
        provider=request.provider,
        request_id=request.request_id,
        agents=request.agents
    )
    
    try:
        # Determine LLM based on mode and provider
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config(request.mode, request.provider)
        

        logger.info(
            "processing_mode_selected",
            mode=request.mode,
            model=llm_config["model"],
            request_id=request.request_id
        )
        
        selected_agents = request.agents or [
            "clinical",
            "patent",
            "iqvia",
            "vision",
            "exim",
            "web_intelligence",
            "internal_knowledge",
            "regulatory",
            "patient_sentiment",
            "esg",
        ]

        # Execute selected agents
        results = {
            "request_id": request.request_id,
            "molecule": request.molecule,
            "processing_mode": request.mode,
            "model_used": llm_config["model"],
            "agents_executed": []
        }
        
        # Run selected agents
        if "clinical" in selected_agents:
            clinical_result = await app.state.clinical_agent.analyze(
                request.molecule, 
                llm_config
            )
            results["clinical"] = clinical_result
            results["agents_executed"].append({
                "name": "ClinicalAgent",
                "status": "completed",
                "duration_ms": clinical_result.get("processing_time_ms", 0)
            })
        
        if "patent" in selected_agents:
            patent_result = await app.state.patent_agent.analyze(
                request.molecule,
                llm_config
            )
            results["patent"] = patent_result
            results["agents_executed"].append({
                "name": "PatentAgent", 
                "status": "completed",
                "duration_ms": patent_result.get("processing_time_ms", 0)
            })
        
        if "iqvia" in selected_agents:
            iqvia_result = await app.state.iqvia_agent.analyze(
                request.molecule,
                llm_config
            )
            results["iqvia"] = iqvia_result
            results["agents_executed"].append({
                "name": "IQVIAInsightsAgent",
                "status": "completed", 
                "duration_ms": iqvia_result.get("processing_time_ms", 0)
            })
        
        if "vision" in selected_agents:
            vision_result = await app.state.vision_agent.analyze(
                request.molecule,
                llm_config
            )
            results["vision"] = vision_result
            results["agents_executed"].append({
                "name": "VisionAgent",
                "status": "completed",
                "duration_ms": vision_result.get("processing_time_ms", 0)
            })
        
        if "exim" in selected_agents:
            exim_result = await app.state.exim_agent.analyze(
                request.molecule,
                llm_config
            )
            results["exim"] = exim_result
            results["agents_executed"].append({
                "name": "EXIMAgent",
                "status": "completed",
                "duration_ms": exim_result.get("processing_time_ms", 0)
            })
        
        if "web_intelligence" in selected_agents:
            web_intel_result = await app.state.web_intel_agent.analyze(
                request.molecule,
                llm_config
            )
            results["web_intelligence"] = web_intel_result
            results["agents_executed"].append({
                "name": "WebIntelligenceAgent",
                "status": "completed",
                "duration_ms": web_intel_result.get("processing_time_ms", 0)
            })
        
        if "internal_knowledge" in selected_agents:
            internal_knowledge_result = await app.state.internal_knowledge_agent.analyze(
                request.molecule,
                llm_config,
                query=None
            )
            results["internal_knowledge"] = internal_knowledge_result
            results["agents_executed"].append({
                "name": "InternalKnowledgeAgent",
                "status": "completed",
                "duration_ms": internal_knowledge_result.get("processing_time_ms", 0)
            })
        
        if "regulatory" in selected_agents:
            regulatory_result = await app.state.regulatory_agent.analyze(
                request.molecule,
                llm_config
            )
            results["regulatory"] = regulatory_result
            results["agents_executed"].append({
                "name": "RegulatoryAgent",
                "status": "completed",
                "duration_ms": regulatory_result.get("processing_time_ms", 0)
            })
        
        if "patient_sentiment" in selected_agents:
            patient_sentiment_result = await app.state.patient_sentiment_agent.analyze(
                request.molecule,
                llm_config
            )
            results["patient_sentiment"] = patient_sentiment_result
            results["agents_executed"].append({
                "name": "PatientSentimentAgent",
                "status": "completed",
                "duration_ms": patient_sentiment_result.get("processing_time_ms", 0)
            })
        
        if "esg" in selected_agents:
            esg_score = random.randint(68, 84)
            environmental_score = min(100, esg_score + random.randint(-4, 6))
            social_score = min(100, esg_score + random.randint(-3, 7))
            governance_score = min(100, esg_score + random.randint(-2, 8))
            esg_result = {
                "overall_esg_score": esg_score,
                "esg_score": esg_score,
                "environmental_score": environmental_score,
                "social_score": social_score,
                "governance_score": governance_score,
                "carbon_intensity": "Moderate",
                "green_suppliers": random.randint(4, 8),
                "labor_score": random.randint(78, 92),
                "waste_score": "B+",
                "water_efficiency": random.randint(10, 24),
                "roadmap": f"{request.molecule} sourcing can align with 2030 sustainable pharma targets",
                "llm_assessment": (
                    f"{request.molecule} shows a viable ESG profile for repurposing, with the clearest "
                    "near-term gains in supplier screening, water efficiency, and greener API sourcing."
                ),
                "processing_time_ms": random.randint(900, 1600)
            }
            results["esg"] = esg_result
            results["agents_executed"].append({
                "name": "ESGAgent",
                "status": "completed",
                "duration_ms": esg_result["processing_time_ms"]
            })
        # Add knowledge graph summary
        results["knowledge_graph"] = {
            "nodes": random.randint(100, 300),
            "edges": random.randint(300, 800),
            "key_pathways": ["PI3K/AKT", "MAPK/ERK", "JAK/STAT", "NF-κB"]
        }
        

        total_processing_time = sum(
            agent.get("duration_ms", 0) for agent in results["agents_executed"]
        )
        completed_agents = len(results["agents_executed"])
        results["orchestrator"] = {
            "agents_coordinated": completed_agents,
            "completed_agents": completed_agents,
            "processing_time_ms": total_processing_time,
            "confidence": random.randint(88, 96),
            "risk_level": "Medium",
            "roi_potential": "High",
            "recommendation": (
                f"{request.molecule} merits continued repurposing review based on multi-agent signal alignment."
            ),
            "llm_synthesis": (
                f"Synthesis complete for {request.molecule}. Cross-agent evidence indicates encouraging "
                "clinical, patent, market, and pathway signals with manageable execution risk."
            )
        }

        logger.info(
            "analysis_completed",
            request_id=request.request_id,
            agents_count=len(results["agents_executed"])
        )
        results["dataMode"] = "DEMO_SYNTHETIC"
        results["verificationStatus"] = "DEMO_ONLY"
        results["evidenceContractVersion"] = EVIDENCE_CONTRACT_VERSION
        results["generatedAt"] = datetime.now().astimezone().isoformat()
        return results
        
    except Exception as e:
        logger.error(
            "analysis_failed",
            request_id=request.request_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )


@app.post("/api/agents/iqvia/market-intelligence")
async def get_market_intelligence(request: ROIRequest):
    """
    IQVIA Market Intelligence endpoint.
    
    Returns detailed market analysis and commercial projections.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=503, detail="Market intelligence is unavailable without source-backed providers.")

    logger.info(
        "market_intelligence_requested",
        molecule=request.molecule,
        request_id=request.request_id
    )
    
    try:
        iqvia_agent = app.state.iqvia_agent
        
        # Get LLM config
        llm_config = app.state.privacy_manager.get_llm_config(
            mode="auto",
            provider=None
        )
        
        result = await iqvia_agent.analyze(request.molecule, llm_config)
        
        return {
            "success": True,
            "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
            "dataMode": "DEMO_SYNTHETIC",
            "verificationStatus": "DEMO_ONLY",
            "generatedAt": datetime.now().astimezone().isoformat(),
            "request_id": request.request_id,
            "data": result
        }
        
    except Exception as e:
        logger.error(
            "roi_calculation_failed",
            request_id=request.request_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"ROI calculation failed: {str(e)}"
        )


@app.get("/api/agents/status")
async def get_agents_status():
    """
    Get status of all available agents.
    """
    return {
        "agents": [
            {"name": "ClinicalAgent", "status": "active", "version": "1.0.0"},
            {"name": "PatentAgent", "status": "active", "version": "1.0.0"},
            {"name": "IQVIAInsightsAgent", "status": "active", "version": "1.0.0"},
            {"name": "EXIMAgent", "status": "active", "version": "1.0.0"},
            {"name": "VisionAgent", "status": "active", "version": "1.0.0"},
            {"name": "WebIntelligenceAgent", "status": "active", "version": "1.0.0"},
            {"name": "InternalKnowledgeAgent", "status": "active", "version": "1.0.0"},
            {"name": "RegulatoryAgent", "status": "active", "version": "1.0.0"},
            {"name": "PatientSentimentAgent", "status": "active", "version": "1.0.0"},
            {"name": "ValidationAgent", "status": "active", "version": "1.0.0"},
            {"name": "MasterOrchestrator", "status": "active", "version": "1.0.0"}
        ],
        "total_agents": 10,
        "orchestrator": "active",
        "knowledge_graph": "connected"
    }


@app.post("/api/orchestrate")
async def orchestrate_analysis(request: OrchestratedRequest):
    """
    Master orchestration endpoint - coordinates all agents intelligently.
    
    The orchestrator:
    1. Analyzes the query to determine required agents
    2. Executes agents in optimal order (parallel when possible)
    3. Validates results with the Skeptic agent
    4. Returns comprehensive, validated analysis
    """
    logger.info(
        "orchestrated_analysis_requested",
        query=request.query[:100],
        molecule=request.molecule,
        disease=request.disease,
        provider=request.provider,
        request_id=request.request_id
    )
    
    try:
        orchestrator: MasterOrchestrator = app.state.orchestrator
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config(request.mode, request.provider)
        
        result = await orchestrator.process_query(
            query=request.query,
            molecule=request.molecule or "Unknown",
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "data": result
        }
        
    except Exception as e:
        logger.error(
            "orchestration_failed",
            request_id=request.request_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail=f"Orchestration failed: {str(e)}"
        )


@app.post("/api/agents/validate")
async def validate_findings(request: dict):
    """
    Skeptic validation endpoint - validates findings from other agents.
    Returns risk flags, confidence scores, and recommendations.
    """
    try:
        validation_agent: ValidationAgent = app.state.validation_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("auto")
        
        result = await validation_agent.analyze(
            molecule=request.get("molecule", "Unknown"),
            agent_results=request.get("findings", {}),
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "validation": result
        }
        
    except Exception as e:
        logger.error("validation_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


# ======================
# EXIM TRADE INTELLIGENCE
# ======================

@app.post("/api/agents/exim")
async def analyze_trade_intelligence(request: EXIMRequest):
    """
    EXIM Trends Agent - Trade Intelligence Analysis.
    Provides global trade flows, sourcing hubs, supply risk flags.
    """
    logger.info(
        "exim_analysis_requested",
        molecule=request.molecule,
        region=request.region,
        request_id=request.request_id
    )
    
    try:
        exim_agent: EXIMAgent = app.state.exim_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("auto")
        
        result = await exim_agent.analyze(
            molecule=request.molecule,
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "agent": "EXIM Trends Agent",
            "data": result
        }
        
    except Exception as e:
        logger.error("exim_analysis_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"EXIM analysis failed: {str(e)}")


@app.get("/api/agents/exim/sourcing-hubs")
async def get_sourcing_hubs():
    """Get global API sourcing hubs ranking"""
    exim_agent: EXIMAgent = app.state.exim_agent
    return {
        "success": True,
        "data": exim_agent.global_sourcing_hubs
    }


# ======================
# IQVIA MARKET INTELLIGENCE
# ======================

@app.post("/api/agents/iqvia")
async def analyze_market_intelligence(request: IQVIARequest):
    """
    IQVIA Insights Agent - Commercial Viability Analysis.
    Provides market size, CAGR, volume shifts, competitor analysis.
    """
    logger.info(
        "iqvia_analysis_requested",
        molecule=request.molecule,
        disease=request.disease,
        request_id=request.request_id
    )
    
    try:
        iqvia_agent: IQVIAInsightsAgent = app.state.iqvia_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("auto")
        
        result = await iqvia_agent.analyze(
            molecule=request.molecule,
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "agent": "IQVIA Insights Agent",
            "data": result
        }
        
    except Exception as e:
        logger.error("iqvia_analysis_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"IQVIA analysis failed: {str(e)}")


@app.post("/api/agents/iqvia/roi")
async def calculate_market_roi(request: IQVIARequest):
    """Calculate ROI estimation using IQVIA market data"""
    logger.info(
        "iqvia_roi_requested",
        molecule=request.molecule,
        disease=request.disease,
        request_id=request.request_id
    )
    
    try:
        iqvia_agent: IQVIAInsightsAgent = app.state.iqvia_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("auto")
        
        result = await iqvia_agent.calculate_roi(
            molecule=request.molecule
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "agent": "IQVIA Insights Agent",
            "data": result
        }
        
    except Exception as e:
        logger.error("iqvia_roi_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"IQVIA ROI calculation failed: {str(e)}")


# ======================
# WEB INTELLIGENCE
# ======================

@app.post("/api/agents/web-intel")
async def gather_web_intelligence(request: WebIntelRequest):
    """
    Web Intelligence Agent - Real-Time Signals.
    Gathers data from PubMed, news, regulatory sources.
    """
    logger.info(
        "web_intel_requested",
        query=request.query,
        sources=request.sources,
        request_id=request.request_id
    )
    
    try:
        web_agent: WebIntelligenceAgent = app.state.web_intel_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("auto")
        
        result = await web_agent.analyze(
            molecule=request.query,
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "agent": "Web Intelligence Agent",
            "data": result
        }
        
    except Exception as e:
        logger.error("web_intel_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Web intelligence gathering failed: {str(e)}")


@app.get("/api/agents/web-intel/pubmed/{query}")
async def search_pubmed(query: str, limit: int = 10):
    """Search PubMed for scientific publications"""
    web_agent: WebIntelligenceAgent = app.state.web_intel_agent
    
    try:
        result = await web_agent.search_pubmed(query, limit)
        return {
            "success": True,
            "source": "PubMed",
            "data": result
        }
    except Exception as e:
        logger.error("pubmed_search_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"PubMed search failed: {str(e)}")


@app.get("/api/agents/web-intel/news/{query}")
async def search_news(query: str, limit: int = 10):
    """Search news sources for regulatory updates"""
    web_agent: WebIntelligenceAgent = app.state.web_intel_agent
    
    try:
        result = await web_agent.search_news(query, limit)
        return {
            "success": True,
            "source": "News & Regulatory",
            "data": result
        }
    except Exception as e:
        logger.error("news_search_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"News search failed: {str(e)}")


# ======================
# INTERNAL KNOWLEDGE BASE
# ======================

@app.post("/api/agents/internal-knowledge")
async def search_internal_knowledge(request: InternalKnowledgeRequest):
    """
    Internal Knowledge Agent - Proprietary Intelligence.
    Searches internal documents using Local LLM for privacy.
    """
    logger.info(
        "internal_knowledge_requested",
        query=request.query,
        document_types=request.document_types,
        request_id=request.request_id
    )
    
    try:
        internal_agent: InternalKnowledgeAgent = app.state.internal_knowledge_agent
        privacy_manager: PrivacyManager = app.state.privacy_manager
        llm_config = privacy_manager.get_llm_config("secure")  # Always use local LLM (Ollama) for internal docs
        
        result = await internal_agent.analyze(
            molecule=request.query,
            query=request.query,
            llm_config=llm_config
        )
        
        return {
            "success": True,
            "request_id": request.request_id,
            "agent": "Internal Knowledge Agent",
            "privacy_mode": "local",
            "data": result
        }
        
    except Exception as e:
        logger.error("internal_knowledge_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Internal knowledge search failed: {str(e)}")


@app.post("/api/agents/internal-knowledge/ingest")
async def ingest_document(file: UploadFile = File(...)):
    """
    Ingest a document into the internal knowledge base.
    Supports PDF, DOCX, TXT, PPTX formats.
    """
    logger.info("document_ingestion_requested", filename=file.filename)
    
    try:
        internal_agent: InternalKnowledgeAgent = app.state.internal_knowledge_agent
        
        # Read file content
        content = await file.read()
        
        result = await internal_agent.ingest_document(
            filename=file.filename,
            content=content,
            content_type=file.content_type
        )
        
        return {
            "success": True,
            "message": f"Document '{file.filename}' ingested successfully",
            "data": result
        }
        
    except Exception as e:
        logger.error("document_ingestion_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Document ingestion failed: {str(e)}")


@app.get("/api/agents/internal-knowledge/documents")
async def list_internal_documents():
    """List all ingested internal documents"""
    internal_agent: InternalKnowledgeAgent = app.state.internal_knowledge_agent
    
    return {
        "success": True,
        "data": internal_agent.list_documents()
    }


# ======================
# DRUGBANK GNN PIPELINE
# ======================

@app.get("/api/gnn/status")
async def get_gnn_status():
    """Get GNN model readiness, artifact path, and training metadata."""
    gnn_service: GNNRepurposingService = app.state.gnn_repurposing
    return {
        "success": True,
        "status": gnn_service.get_status()
    }


@app.post("/api/gnn/train")
async def train_gnn_model(request: GNNTrainRequest):
    """
    Train DrugBank-oriented GNN link-prediction model and persist artifact.
    """
    gnn_service: GNNRepurposingService = app.state.gnn_repurposing

    try:
        training_result = gnn_service.train(
            dataset_path=request.dataset_path,
            epochs=request.epochs,
            learning_rate=request.learning_rate,
            hidden_dim=request.hidden_dim,
            embedding_dim=request.embedding_dim,
            warm_start=False,
        )

        return {
            "success": True,
            "message": "GNN training completed and artifact saved",
            "data": training_result
        }
    except Exception as e:
        logger.error("gnn_training_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GNN training failed: {str(e)}")


@app.post("/api/gnn/evaluate")
async def evaluate_gnn_model(request: GNNEvaluateRequest):
    """
    Evaluate DrugBank-oriented GNN using a held-out split of drug-disease treat edges.
    Persists offline evaluation metrics for benchmark display.
    """
    gnn_service: GNNRepurposingService = app.state.gnn_repurposing

    try:
        evaluation_result = gnn_service.evaluate(
            dataset_path=request.dataset_path,
            holdout_ratio=request.holdout_ratio,
            epochs=request.epochs,
            learning_rate=request.learning_rate,
            hidden_dim=request.hidden_dim,
            embedding_dim=request.embedding_dim,
        )

        return {
            "success": True,
            "message": "GNN evaluation completed and metrics saved",
            "data": evaluation_result
        }
    except Exception as e:
        logger.error("gnn_evaluation_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GNN evaluation failed: {str(e)}")


@app.post("/api/gnn/repurpose")
async def gnn_repurpose_prediction(request: GNNRepurposeRequest):
    """
    Predict ranked repurposing candidates for a disease using trained GNN model.
    """
    gnn_service: GNNRepurposingService = app.state.gnn_repurposing

    try:
        result = gnn_service.predict(request.disease, request.top_k)
        return {
            "success": True,
            "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
            "dataMode": "MODEL_PREDICTION",
            "verificationStatus": "MODEL_INFERENCE",
            "model": result["model"],
            "disease": result["disease"],
            "candidates": result["candidates"],
            "metadata": {
                "mode": "gnn-link-prediction",
                "modelVersion": result["model"],
                "generatedAt": datetime.now().isoformat(),
                "evidenceFormat": "drug -> target/pathway -> disease"
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("gnn_prediction_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GNN prediction failed: {str(e)}")


@app.post("/api/gnn/online-update")
async def gnn_online_update(request: GNNOnlineUpdateRequest):
    """
    Apply online KG updates and warm-retrain model, then persist updated artifact.
    """
    gnn_service: GNNRepurposingService = app.state.gnn_repurposing

    try:
        relations = [r.model_dump() for r in request.relations]
        result = gnn_service.online_update(relations=relations, epochs=request.epochs)
        return {
            "success": True,
            "message": "Online update completed and model artifact refreshed",
            "data": result
        }
    except Exception as e:
        logger.error("gnn_online_update_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GNN online update failed: {str(e)}")


# ======================
# ERROR HANDLERS
# ======================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "path": str(request.url.path)
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error("unhandled_exception", error=str(exc), path=str(request.url.path))
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "path": str(request.url.path)
        }
    )


# ======================
# ENTRY POINT
# ======================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )







