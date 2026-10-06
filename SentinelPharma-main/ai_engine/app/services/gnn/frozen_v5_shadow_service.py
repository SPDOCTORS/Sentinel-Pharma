"""Read-only V5 R-GCN shadow ranking with frozen artifact lineage."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.evidence import DataMode, VerificationStatus
from app.services.gnn.v4_candidate_ranker import CandidateRanker


V5_DATASET_VERSION = "biomedical_graph_v5"
V5_DATASET_HASH = "9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90"
V5_MODEL_NAME = "frozen-v5-rgcn-shadow"


class FrozenV5ShadowService:
    """Lazily load the frozen V5 graph and checkpoint without mutating either."""

    def __init__(self, ai_engine_root: Path):
        root = Path(ai_engine_root)
        self.graph_path = root / "artifacts/biomedical_graph/phase2p/biomedical_graph_v5_20260924T052339Z/graph.json"
        self.robust_artifact = root / "artifacts/gnn/evaluations/v5_rgcn_robust_20260924T052936Z"
        self._ranker: CandidateRanker | None = None

    def _get_ranker(self) -> CandidateRanker:
        if self._ranker is None:
            self._ranker = CandidateRanker(
                self.graph_path,
                expected_hash=V5_DATASET_HASH,
                robust_artifact=self.robust_artifact,
                expected_dataset_version=V5_DATASET_VERSION,
            )
        return self._ranker

    def predict(self, disease: str, top_k: int = 5) -> dict[str, Any]:
        ranker = self._get_ranker()
        rows = ranker.rank_drugs_for_disease(disease, top_k)
        if not rows:
            raise ValueError("No unobserved V5 drug candidates are available for this disease")

        selection = ranker.selection
        candidates = [
            {
                "rank": row["rank"],
                "drug": row["drug"].get("name") or row["drug"]["id"],
                "drugId": row["drug"]["id"],
                "score": row["modelScore"],
                "candidateStatus": row["candidateStatus"],
                "evidenceLevel": VerificationStatus.MODEL_INFERENCE.value,
                "structuralEvidence": row["structuralSupport"],
                "provenance": {
                    "dataMode": DataMode.MODEL_PREDICTION.value,
                    "verificationStatus": VerificationStatus.MODEL_INFERENCE.value,
                    "graphDatasetVersion": row["graphDatasetVersion"],
                    "graphDatasetHash": row["graphDatasetHash"],
                    "checkpointHash": row["checkpointHash"],
                },
            }
            for row in rows
        ]
        disease_entity = rows[0]["disease"]
        return {
            "model": V5_MODEL_NAME,
            "disease": disease_entity.get("name") or disease_entity["id"],
            "diseaseEntity": disease_entity,
            "topK": top_k,
            "candidates": candidates,
            "modelLineage": {
                "architecture": "R-GCN",
                "graphDatasetVersion": V5_DATASET_VERSION,
                "graphDatasetHash": V5_DATASET_HASH,
                "checkpointHash": selection["sha256"],
                "splitStrategy": selection["split"]["strategy"],
                "splitSeed": selection["splitSeed"],
                "modelSeed": selection["modelSeed"],
                "selectedEpoch": selection["selectedEpoch"],
                "selectionMetric": "validation filtered MRR",
                "validationMrr": selection["validationMrr"],
            },
            "metadata": {
                "shadow": True,
                "primary": False,
                "scoreSemantics": "experimental model score; not a probability",
                "candidateUniversePolicy": "V5 drugs excluding source-backed known indications for the resolved disease",
            },
        }
