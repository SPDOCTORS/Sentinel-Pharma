"""Bounded, source-backed V5 neighborhoods for live research only."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.core.evidence import EVIDENCE_CONTRACT_VERSION, DataMode, VerificationStatus, unavailable_response


V5_DATASET_VERSION = "biomedical_graph_v5"
V5_DATASET_HASH = "9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90"
MAX_TARGETS = 8
MAX_PATHWAYS = 12


class V5EvidenceGraphService:
    """Read a frozen V5 artifact and return only real connecting relations."""

    def __init__(self, ai_engine_root: Path):
        self.graph_path = Path(ai_engine_root) / "artifacts/biomedical_graph/phase2p/biomedical_graph_v5_20260924T052339Z/graph.json"
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        graph = json.loads(self.graph_path.read_text(encoding="utf-8"))
        if graph.get("datasetVersion") != V5_DATASET_VERSION or graph.get("datasetHash") != V5_DATASET_HASH:
            raise ValueError("V5 evidence graph lineage mismatch")

        self.graph = graph
        self.entities = {item["canonicalId"]: item for item in graph["entities"]}
        self.drug_targets: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.disease_targets: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.target_pathways: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for edge in graph["relations"]:
            relation_type = edge.get("relationType")
            if relation_type == "DRUG_TARGET":
                self.drug_targets[edge["source"]].append(edge)
            elif relation_type == "DISEASE_TARGET":
                self.disease_targets[edge["target"]].append(edge)
            elif relation_type == "TARGET_PATHWAY":
                self.target_pathways[edge["source"]].append(edge)
        self._loaded = True

    def _resolve(self, query: str, entity_type: str) -> str:
        if not isinstance(query, str) or not query.strip():
            raise ValueError(f"{entity_type.lower()} is required")
        normalized = query.strip().casefold()
        matches = []
        for identifier, entity in self.entities.items():
            if entity.get("entityType") != entity_type:
                continue
            names = {
                identifier.casefold(),
                str(entity.get("name", "")).casefold(),
                *(str(alias).casefold() for alias in entity.get("aliases", [])),
            }
            if normalized in names:
                matches.append(identifier)
        if len(matches) != 1:
            raise ValueError(f"Unknown or ambiguous {entity_type.lower()} identifier: {query}")
        return matches[0]

    @staticmethod
    def _node(entity: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": entity["canonicalId"],
            "label": entity.get("name") or entity["canonicalId"],
            "type": entity["entityType"],
            "metadata": {"sourceIds": entity.get("sourceIds", {})},
            "provenance": entity.get("provenance", []),
        }

    @staticmethod
    def _edge(edge: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": edge["source"],
            "target": edge["target"],
            "type": edge["relationType"],
            "provenance": edge.get("provenance", []),
        }

    def subgraph(self, drug: str, disease: str) -> dict[str, Any]:
        """Return a bounded drug -> shared target -> disease/pathway neighborhood."""
        self._load()
        drug_id = self._resolve(drug, "DRUG")
        disease_id = self._resolve(disease, "DISEASE")

        drug_edges = {edge["target"]: edge for edge in self.drug_targets.get(drug_id, [])}
        disease_edges = {edge["source"]: edge for edge in self.disease_targets.get(disease_id, [])}
        shared_targets = sorted(set(drug_edges) & set(disease_edges))[:MAX_TARGETS]
        if not shared_targets:
            raise ValueError("No V5 drug-target-disease relationship exists for this pair")

        selected_edges = []
        selected_pathway_edges = []
        for target_id in shared_targets:
            selected_edges.extend((drug_edges[target_id], disease_edges[target_id]))
            remaining = MAX_PATHWAYS - len(selected_pathway_edges)
            if remaining > 0:
                selected_pathway_edges.extend(
                    sorted(self.target_pathways.get(target_id, []), key=lambda item: item["target"])[:remaining]
                )

        node_ids = {drug_id, disease_id, *shared_targets}
        node_ids.update(edge["target"] for edge in selected_pathway_edges)
        edges = [*selected_edges, *selected_pathway_edges]
        sources = sorted({
            provenance.get("source")
            for edge in edges
            for provenance in edge.get("provenance", [])
            if provenance.get("source")
        })
        return {
            "success": True,
            "evidenceContractVersion": EVIDENCE_CONTRACT_VERSION,
            "dataMode": DataMode.SOURCE_BACKED.value,
            "verificationStatus": VerificationStatus.VERIFIED_SOURCE.value,
            "retrievedAt": self.graph["generationTimestamp"],
            "graphDatasetVersion": V5_DATASET_VERSION,
            "graphDatasetHash": V5_DATASET_HASH,
            "sourceVersions": self.graph.get("sourceVersions", {}),
            "sources": sources,
            "bounds": {"maxTargets": MAX_TARGETS, "maxPathways": MAX_PATHWAYS},
            "focus": {"drugId": drug_id, "diseaseId": disease_id},
            "nodes": [self._node(self.entities[identifier]) for identifier in sorted(node_ids)],
            "edges": [self._edge(edge) for edge in edges],
            "limitations": [
                "The graph contains only frozen V5 source relationships connecting the exact drug and disease.",
                "Structural connectivity does not establish therapeutic efficacy or clinical validity.",
            ],
        }

    def subgraph_or_unavailable(self, drug: str, disease: str | None) -> dict[str, Any]:
        if not disease:
            return {
                **unavailable_response("DISEASE_NOT_PROVIDED", "Provide a disease to request V5 graph evidence."),
                "nodes": [],
                "edges": [],
            }
        try:
            return self.subgraph(drug, disease)
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return {
                **unavailable_response(
                    "V5_GRAPH_EVIDENCE_UNAVAILABLE",
                    "No exact, source-backed V5 drug-target-disease neighborhood is available for this request.",
                ),
                "nodes": [],
                "edges": [],
            }
