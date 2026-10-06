"""Offline experimental candidate ranker backed by a selected Phase 2J R-GCN checkpoint."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch

from app.core.evidence import DataMode, VerificationStatus, unavailable_response
from app.services.clinical_trials_service import ClinicalTrialsService, ClinicalTrialsUnavailable
from app.services.gnn.v4_link_prediction_dataset import V4LinkPredictionDataset
from app.services.gnn.v4_rgcn_evaluate import Predictor, RGCNEncoder, relation_tensor_graph
from app.services.pubmed_service import PubMedService, PubMedUnavailable


GRAPH_HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"
ROBUST_ARTIFACT = Path(__file__).resolve().parents[3] / "artifacts/gnn/evaluations/v4_rgcn_robust_20260921T084017Z"
CANONICAL_SPLIT_SEED = 42
CANONICAL_MODEL_SEED = 42


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CandidateRanker:
    """Loads a fixed validation-selected checkpoint; ranking makes no HTTP calls."""

    def __init__(
        self,
        graph_path: Path,
        *,
        expected_hash: str = GRAPH_HASH,
        robust_artifact: Path = ROBUST_ARTIFACT,
        expected_dataset_version: str = "biomedical_graph_v4",
    ):
        self.dataset = V4LinkPredictionDataset.load(graph_path, expected_hash)
        self.graph_path = Path(graph_path)
        self.robust_artifact = Path(robust_artifact)
        self.expected_dataset_version = expected_dataset_version
        self.selection = self._select_checkpoint()
        self.split = self.dataset.split("per_drug_stratified", self.selection["splitSeed"])
        self.graph = relation_tensor_graph(self.dataset, self.split)
        self.entities = {item["canonicalId"]: item for item in self.dataset.graph["entities"]}
        self.encoder, self.predictor = self._load_model()
        self.embeddings = self._embeddings()

    def _select_checkpoint(self) -> dict[str, Any]:
        manifest_path = self.robust_artifact / "experiment_manifest.json"
        runs_path = self.robust_artifact / "per_run_metrics.json"
        if not manifest_path.is_file() or not runs_path.is_file():
            raise ValueError("Phase 2J robust artifact is incomplete")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("graph", {}).get("datasetVersion") != self.expected_dataset_version or manifest["graph"].get("datasetHash") != self.dataset.graph["datasetHash"]:
            raise ValueError("Phase 2J artifact graph lineage mismatch")
        # Predetermined canonical identity, not a comparison among test metrics.
        matches = [item for item in json.loads(runs_path.read_text(encoding="utf-8")) if item["splitSeed"] == CANONICAL_SPLIT_SEED and item["modelSeed"] == CANONICAL_MODEL_SEED]
        if len(matches) != 1:
            raise ValueError("Canonical validation-selected checkpoint is unavailable")
        run = matches[0]
        checkpoint = Path(run["checkpoint"]["path"])
        if not checkpoint.is_absolute():
            # Manifests created from different working directories contain
            # either ``artifacts/...`` or ``ai_engine/artifacts/...``. The
            # selected checkpoint must still live in this frozen evaluation.
            checkpoint_name = Path(str(checkpoint).replace("\\", "/")).name
            checkpoint = self.robust_artifact / "checkpoints" / checkpoint_name
        if not checkpoint.is_file() or _sha256(checkpoint) != run["checkpoint"]["sha256"]:
            raise ValueError("Checkpoint SHA256 mismatch")
        if run.get("selectedEpoch") is None or run.get("validationMrr") is None:
            raise ValueError("Checkpoint lacks validation-selection lineage")
        return {"splitSeed": CANONICAL_SPLIT_SEED, "modelSeed": CANONICAL_MODEL_SEED, "selectedEpoch": run["selectedEpoch"], "validationMrr": run["validationMrr"], "split": self.split_manifest(CANONICAL_SPLIT_SEED), "path": str(checkpoint), "sha256": run["checkpoint"]["sha256"], "selectionPolicy": "Fixed canonical primary split seed 42 and predetermined model seed 42; use its Phase 2J validation-MRR-selected epoch. No test metric participates in selection."}

    def split_manifest(self, seed: int) -> dict[str, Any]:
        return self.dataset.split("per_drug_stratified", seed).manifest()

    def _load_model(self) -> tuple[RGCNEncoder, Predictor]:
        payload = torch.load(self.selection["path"], map_location="cpu", weights_only=True)
        if payload.get("modelSeed") != self.selection["modelSeed"] or payload.get("selectedEpoch") != self.selection["selectedEpoch"]:
            raise ValueError("Checkpoint metadata lineage mismatch")
        encoder, predictor = RGCNEncoder(self.graph["x"].shape[1]), Predictor()
        encoder.load_state_dict(payload["encoder"]); predictor.load_state_dict(payload["predictor"])
        encoder.eval(); predictor.eval()
        return encoder, predictor

    def _embeddings(self) -> torch.Tensor:
        with torch.no_grad():
            return self.encoder(self.graph["x"], self.graph["edge_index"], self.graph["edge_type"])

    def _resolve_drug(self, drug_id: str) -> str:
        if not isinstance(drug_id, str) or not drug_id.strip():
            raise ValueError("drug_id is required")
        query = drug_id.strip().casefold()
        matches = [identifier for identifier, item in self.entities.items() if item["entityType"] == "DRUG" and query in {identifier.casefold(), str(item.get("name", "")).casefold(), *(str(alias).casefold() for alias in item.get("aliases", []))}]
        if len(matches) != 1:
            raise ValueError(f"Unknown or ambiguous drug identifier: {drug_id}")
        return matches[0]

    def _resolve_disease(self, disease_id: str) -> str:
        """Resolve only exact canonical IDs, names, or aliases; never guess."""
        if not isinstance(disease_id, str) or not disease_id.strip():
            raise ValueError("disease_id is required")
        query = disease_id.strip().casefold()
        matches = [
            identifier
            for identifier, item in self.entities.items()
            if item["entityType"] == "DISEASE"
            and query
            in {
                identifier.casefold(),
                str(item.get("name", "")).casefold(),
                *(str(alias).casefold() for alias in item.get("aliases", [])),
            }
        ]
        if len(matches) != 1:
            raise ValueError(f"Unknown or ambiguous disease identifier: {disease_id}")
        return matches[0]

    def _score(self, drug: str, disease: str) -> float:
        index = self.graph["index"]
        with torch.no_grad():
            return float(torch.sigmoid(self.predictor(self.embeddings[index[drug]].unsqueeze(0), self.embeddings[index[disease]].unsqueeze(0))).item())

    def _named_entity(self, identifier: str) -> dict[str, Any]:
        item = self.entities[identifier]
        return {"id": identifier, "name": item.get("name"), "entityType": item["entityType"]}

    def get_known_indications(self, drug_id: str) -> list[dict[str, Any]]:
        drug = self._resolve_drug(drug_id)
        output = []
        for relation in self.dataset.relations:
            if relation["relationType"] == "DRUG_INDICATION" and relation["source"] == drug:
                output.append({"drug": self._named_entity(drug), "disease": self._named_entity(relation["target"]), "candidateStatus": "KNOWN_INDICATION", "relationId": {"source": relation["source"], "target": relation["target"], "relationType": relation["relationType"]}, "provenance": relation["provenance"]})
        return sorted(output, key=lambda item: item["disease"]["id"])

    def _structural_support(self, drug: str, disease: str) -> dict[str, Any]:
        relations = self.graph["relations"]
        drug_edges = [edge for edge in relations if edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug]
        disease_edges = [edge for edge in relations if edge["relationType"] == "DISEASE_TARGET" and edge["target"] == disease]
        shared = sorted({edge["target"] for edge in drug_edges} & {edge["source"] for edge in disease_edges})
        pathway_edges = [edge for edge in relations if edge["relationType"] == "TARGET_PATHWAY" and edge["source"] in shared]
        support_edges = [edge for edge in drug_edges if edge["target"] in shared] + [edge for edge in disease_edges if edge["source"] in shared] + pathway_edges
        return {"sharedTargets": [self._named_entity(target) for target in shared], "sharedTargetCount": len(shared), "pathways": [self._named_entity(edge["target"]) for edge in pathway_edges], "relationIds": [{"source": edge["source"], "target": edge["target"], "relationType": edge["relationType"]} for edge in support_edges], "provenance": [edge["provenance"] for edge in support_edges], "note": "Structural graph support is not evidence that an indication is clinically valid."}

    def rank_candidates(self, drug_id: str, top_k: int = 10) -> list[dict[str, Any]]:
        if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1:
            raise ValueError("top_k must be a positive integer")
        drug = self._resolve_drug(drug_id)
        candidates = [disease for disease in self.dataset.diseases if (drug, disease) not in self.dataset.positive_set]
        ranked = sorted(((disease, self._score(drug, disease)) for disease in candidates), key=lambda item: (-item[1], item[0]))[:top_k]
        return [{"drug": self._named_entity(drug), "disease": self._named_entity(disease), "modelScore": score, "rank": rank, "candidateStatus": "UNOBSERVED_CANDIDATE", "provenance": DataMode.MODEL_PREDICTION.value, "verificationStatus": VerificationStatus.MODEL_INFERENCE.value, "graphDatasetVersion": self.dataset.graph["datasetVersion"], "graphDatasetHash": self.dataset.graph["datasetHash"], "checkpointHash": self.selection["sha256"], "structuralSupport": self._structural_support(drug, disease)} for rank, (disease, score) in enumerate(ranked, 1)]

    def rank_drugs_for_disease(self, disease_id: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Rank unobserved drugs for one exactly resolved disease."""
        if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1:
            raise ValueError("top_k must be a positive integer")
        disease = self._resolve_disease(disease_id)
        candidates = [drug for drug in self.dataset.drugs if (drug, disease) not in self.dataset.positive_set]
        ranked = sorted(
            ((drug, self._score(drug, disease)) for drug in candidates),
            key=lambda item: (-item[1], item[0]),
        )[:top_k]
        return [
            {
                "drug": self._named_entity(drug),
                "disease": self._named_entity(disease),
                "modelScore": score,
                "rank": rank,
                "candidateStatus": "UNOBSERVED_CANDIDATE",
                "provenance": DataMode.MODEL_PREDICTION.value,
                "verificationStatus": VerificationStatus.MODEL_INFERENCE.value,
                "graphDatasetVersion": self.dataset.graph["datasetVersion"],
                "graphDatasetHash": self.dataset.graph["datasetHash"],
                "checkpointHash": self.selection["sha256"],
                "structuralSupport": self._structural_support(drug, disease),
            }
            for rank, (drug, score) in enumerate(ranked, 1)
        ]

    async def enrich_candidate_evidence(self, candidate: dict[str, Any], *, pubmed_service: PubMedService | None = None, clinical_trials_service: ClinicalTrialsService | None = None, limit: int = 5) -> dict[str, Any]:
        drug = candidate["drug"]["name"]
        disease = candidate["disease"]["name"]
        try:
            pubmed = await (pubmed_service or PubMedService()).search(f"{drug} {disease}", limit)
        except PubMedUnavailable as exc:
            pubmed = unavailable_response("PUBMED_UNAVAILABLE", str(exc))
        try:
            trials = await (clinical_trials_service or ClinicalTrialsService()).search(drug=drug, condition=disease, limit=limit)
        except ClinicalTrialsUnavailable as exc:
            trials = unavailable_response("CLINICAL_TRIALS_UNAVAILABLE", str(exc))
        return {
            "candidate": candidate,
            "model": {"architecture": "R-GCN", "checkpointHash": self.selection["sha256"], "graphDatasetVersion": self.dataset.graph["datasetVersion"], "graphDatasetHash": self.dataset.graph["datasetHash"]},
            "structuralSupport": candidate["structuralSupport"],
            "externalEvidence": {"pubmed": pubmed, "clinicalTrials": trials},
            "limitations": ["External search results remain source-backed evidence and do not validate the model prediction."],
        }

    def manifest(self) -> dict[str, Any]:
        return {"graphDatasetVersion": self.dataset.graph["datasetVersion"], "graphDatasetHash": self.dataset.graph["datasetHash"], "checkpoint": self.selection, "architecture": "R-GCN", "candidateUniversePolicy": "All V4 DISEASE entities excluding complete known DRUG_INDICATION pairs for the requested drug.", "knownPositiveFilteringPolicy": "Known indications are returned only by get_known_indications and never rank_candidates.", "provenanceContract": {"prediction": DataMode.MODEL_PREDICTION.value, "externalEvidence": DataMode.SOURCE_BACKED.value, "unavailable": DataMode.UNAVAILABLE.value}}

    def write_manifest(self, root: Path) -> Path:
        root = Path(root); root.mkdir(parents=True, exist_ok=False)
        path = root / "ranker_manifest.json"
        path.write_text(json.dumps({**self.manifest(), "createdAt": datetime.now(timezone.utc).isoformat()}, indent=2), encoding="utf-8")
        return path
