"""Experimental service: frozen V4 model scores plus separately attached V5 evidence."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.evidence import unavailable_response
from app.services.gnn.v4_candidate_ranker import CandidateRanker

V4_HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"
V5_HASH = "9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90"


class ExperimentalCandidateService:
    def __init__(self, v4_graph: Path, v5_graph: Path, v4_robust_artifact: Path):
        self.ranker = CandidateRanker(Path(v4_graph), expected_hash=V4_HASH, robust_artifact=Path(v4_robust_artifact))
        self.v5 = json.loads(Path(v5_graph).read_text(encoding="utf-8"))
        if self.v5.get("datasetVersion") != "biomedical_graph_v5" or self.v5.get("datasetHash") != V5_HASH:
            raise ValueError("V5 structural graph lineage mismatch")
        self.entities = {item["canonicalId"]: item for item in self.v5["entities"]}
        self.relations = self.v5["relations"]
        self.bridge = {identifier: identifier for identifier, item in self.entities.items() if item["entityType"] == "DISEASE"}
        for edge in self.relations:
            if edge["relationType"] != "DISEASE_TARGET":
                continue
            metadata = edge["provenance"][0].get("metadata", {})
            original = metadata.get("originalDiseaseId")
            if original and edge["target"] in self.bridge:
                self.bridge[original] = edge["target"]

    def _bridge_disease(self, disease_id: str) -> str | None:
        return self.bridge.get(disease_id)

    def _structural(self, drug_id: str, disease_id: str) -> dict[str, Any]:
        disease = self._bridge_disease(disease_id)
        if disease is None:
            return {"status": "UNAVAILABLE", "reason": "unresolved deterministic disease bridge", "sharedTargets": [], "sharedTargetCount": 0, "pathways": [], "sources": []}
        drug_targets = {edge["target"] for edge in self.relations if edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug_id}
        disease_edges = [edge for edge in self.relations if edge["relationType"] == "DISEASE_TARGET" and edge["target"] == disease]
        disease_targets = {edge["source"] for edge in disease_edges}
        shared = sorted(drug_targets & disease_targets)
        paths = [edge for edge in self.relations if edge["relationType"] == "TARGET_PATHWAY" and edge["source"] in shared]
        sources = [edge["provenance"] for edge in disease_edges if edge["source"] in shared]
        return {"status": "AVAILABLE", "graphDatasetVersion": self.v5["datasetVersion"], "graphDatasetHash": self.v5["datasetHash"], "sharedTargets": [{"id": target, "name": self.entities[target].get("name")} for target in shared], "sharedTargetCount": len(shared), "pathways": [{"id": edge["target"], "name": self.entities[edge["target"]].get("name")} for edge in paths], "sources": sources}

    def _result(self, ranked: dict[str, Any]) -> dict[str, Any]:
        return {"candidate": {key: ranked[key] for key in ("drug", "disease", "rank", "modelScore", "candidateStatus", "provenance")}, "model": {"architecture": "R-GCN", "graphDatasetVersion": "biomedical_graph_v4", "graphDatasetHash": V4_HASH, "checkpointHash": self.ranker.selection["sha256"], "scoreSemantics": "experimental model score; not probability"}, "structuralEvidence": self._structural(ranked["drug"]["id"], ranked["disease"]["id"]), "externalEvidence": {"pubmed": unavailable_response("NOT_REQUESTED", "External enrichment was not requested"), "clinicalTrials": unavailable_response("NOT_REQUESTED", "External enrichment was not requested")}, "limitations": ["V5 structural evidence does not alter V4 model rank or score.", "Structural support is not clinical validity."]}

    def rank_candidates(self, drug_id: str, top_k: int = 10) -> list[dict[str, Any]]:
        return [self._result(item) for item in self.ranker.rank_candidates(drug_id, top_k)]

    def get_candidate_details(self, drug_id: str, disease_id: str) -> dict[str, Any]:
        for item in self.ranker.rank_candidates(drug_id, len(self.ranker.dataset.diseases)):
            if item["disease"]["id"] == disease_id:
                return self._result(item)
        raise ValueError("Disease is a known indication or is not a V4 disease")

    def get_known_indications(self, drug_id: str) -> list[dict[str, Any]]:
        return self.ranker.get_known_indications(drug_id)

    async def enrich_candidate_evidence(self, drug_id: str, disease_id: str) -> dict[str, Any]:
        result = self.get_candidate_details(drug_id, disease_id)
        enriched = await self.ranker.enrich_candidate_evidence({"drug": result["candidate"]["drug"], "disease": result["candidate"]["disease"], "structuralSupport": result["structuralEvidence"]})
        result["externalEvidence"] = enriched["externalEvidence"]
        return result
