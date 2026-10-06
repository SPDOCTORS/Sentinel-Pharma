"""Live, source-backed research retrieval with optional read-only model ranking."""

from datetime import datetime, timezone
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.core.evidence import EVIDENCE_CONTRACT_VERSION, EvidenceItem, unavailable_response
from app.services.clinical_trials_service import ClinicalTrialsService, ClinicalTrialsUnavailable
from app.services.pubmed_service import PubMedService, PubMedUnavailable


def _source_result(source: str, result: dict[str, Any]) -> dict[str, Any]:
    evidence = [
        EvidenceItem(**item).model_dump(mode="json", exclude_none=True)
        for item in result["evidence"]
    ]
    return {
        "success": True,
        "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
        "dataMode": "SOURCE_BACKED",
        "verificationStatus": "VERIFIED_SOURCE",
        "source": source,
        "query": result.get("query"),
        "retrievedAt": result["retrievedAt"],
        "count": len(evidence),
        "evidence": evidence,
    }


async def analyze_live_research(
    molecule: str,
    disease: str | None,
    request_id: str,
    gnn_service: Any,
    v5_shadow_service: Any | None = None,
    v5_evidence_graph_service: Any | None = None,
) -> dict[str, Any]:
    """Keep each source and the prediction separate; a failed source never gains substitutes."""
    query = f"{molecule} {disease}" if disease else molecule
    sources: dict[str, dict[str, Any]] = {}
    executed: list[dict[str, str]] = []

    try:
        pubmed = await PubMedService().search(query, 10)
        sources["pubmed"] = _source_result("PubMed", pubmed)
        executed.append({"name": "PubMedService", "status": "completed"})
    except (PubMedUnavailable, ValueError, KeyError) as error:
        sources["pubmed"] = unavailable_response("PUBMED_UNAVAILABLE", "PubMed retrieval is unavailable.")
        executed.append({"name": "PubMedService", "status": "failed"})

    try:
        trials = await ClinicalTrialsService().search(drug=molecule, condition=disease, limit=10)
        sources["clinicalTrials"] = _source_result("ClinicalTrials.gov", trials)
        executed.append({"name": "ClinicalTrialsService", "status": "completed"})
    except (ClinicalTrialsUnavailable, ValueError, KeyError):
        sources["clinicalTrials"] = unavailable_response(
            "CLINICAL_TRIALS_UNAVAILABLE", "ClinicalTrials.gov retrieval is unavailable."
        )
        executed.append({"name": "ClinicalTrialsService", "status": "failed"})

    citations = [
        item for result in sources.values() for item in result.get("evidence", [])
    ]
    if disease:
        try:
            prediction = await run_in_threadpool(gnn_service.predict, disease, 5)
            model_prediction = {
                "success": True,
                "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
                "dataMode": "MODEL_PREDICTION",
                "verificationStatus": "MODEL_INFERENCE",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                **prediction,
            }
            executed.append({"name": "GNNRepurposingService", "status": "completed"})
        except (RuntimeError, ValueError, FileNotFoundError):
            model_prediction = unavailable_response(
                "GNN_UNAVAILABLE", "No compatible model ranking is available for this disease."
            )
            executed.append({"name": "GNNRepurposingService", "status": "failed"})

        if v5_shadow_service is not None:
            try:
                shadow = await run_in_threadpool(v5_shadow_service.predict, disease, 5)
                shadow_prediction = {
                    "success": True,
                    "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
                    "dataMode": "MODEL_PREDICTION",
                    "verificationStatus": "MODEL_INFERENCE",
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "shadow": True,
                    "primary": False,
                    **shadow,
                }
                executed.append({"name": "FrozenV5ShadowService", "status": "completed"})
            except Exception:
                shadow_prediction = {
                    **unavailable_response(
                        "V5_SHADOW_UNAVAILABLE",
                        "The frozen V5 shadow ranking is unavailable for this disease.",
                    ),
                    "shadow": True,
                    "primary": False,
                }
                executed.append({"name": "FrozenV5ShadowService", "status": "failed"})
        else:
            shadow_prediction = {
                **unavailable_response("V5_SHADOW_NOT_CONFIGURED", "The frozen V5 shadow ranker is not configured."),
                "shadow": True,
                "primary": False,
            }
    else:
        model_prediction = unavailable_response(
            "DISEASE_NOT_PROVIDED", "Provide a disease to request model candidate ranking."
        )
        executed.append({"name": "GNNRepurposingService", "status": "skipped"})
        shadow_prediction = {
            **unavailable_response("DISEASE_NOT_PROVIDED", "Provide a disease to request V5 shadow ranking."),
            "shadow": True,
            "primary": False,
        }
        executed.append({"name": "FrozenV5ShadowService", "status": "skipped"})

    available = bool(citations)
    data_mode = "SOURCE_BACKED" if available else "UNAVAILABLE"
    if v5_evidence_graph_service is None:
        knowledge_graph = {
            **unavailable_response("V5_GRAPH_NOT_CONFIGURED", "The frozen V5 evidence graph is not configured."),
            "nodes": [],
            "edges": [],
        }
    else:
        try:
            knowledge_graph = await run_in_threadpool(
                v5_evidence_graph_service.subgraph_or_unavailable, molecule, disease
            )
        except Exception:
            knowledge_graph = {
                **unavailable_response(
                    "V5_GRAPH_EVIDENCE_UNAVAILABLE",
                    "No exact, source-backed V5 drug-target-disease neighborhood is available for this request.",
                ),
                "nodes": [],
                "edges": [],
            }
    response = {
        "request_id": request_id,
        "molecule": molecule,
        "disease": disease,
        "researchMode": "live",
        "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
        "dataMode": data_mode,
        "verificationStatus": "VERIFIED_SOURCE" if available else "NOT_AVAILABLE",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "degraded": any(not item.get("success") for item in sources.values()),
        "sourceResults": sources,
        "citations": citations,
        "modelPrediction": model_prediction,
        "shadowModelPrediction": shadow_prediction,
        "knowledge_graph": knowledge_graph,
        "agents_executed": executed,
        "summary": {
            "overallAssessment": (
                f"Retrieved {len(citations)} source records for {molecule}. "
                "Record presence and model ranking do not establish therapeutic efficacy."
                if available else
                f"No source records are available for {molecule}."
            ),
            "keyFindings": [],
            "risks": [],
            "opportunities": [],
            "recommendations": [],
        },
    }
    if not available:
        response["unavailableReason"] = {
            "code": "NO_SOURCE_RECORDS",
            "message": "No source-backed records could be retrieved for this request.",
        }
    return response
