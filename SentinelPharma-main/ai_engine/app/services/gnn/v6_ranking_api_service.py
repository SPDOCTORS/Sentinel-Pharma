"""SentinelPharma V6 Read-Only Experimental Ranking Service.

Implements a read-only, disease-first drug repurposing candidate ranking API
using the frozen V6 Connectivity-Aware Hybrid Ranker:
1. Loads frozen graph, splits, scaler, combiner weights, and checkpoint from the
   locked test evaluation manifest (locked_test_evaluation_manifest.json).
2. Verifies cryptographic SHA-256 hashes on initialization to guarantee provenance.
3. Precomputes and caches R-GCN node representations for low-latency inference.
4. Ranks candidate drugs for any queried disease across all 6,057 graph drugs using:
   logit(d, c) = w_2hop * s_2hop + w_pop * s_pop + w_rgcn * s_rgcn + w_inter * (s_2hop * s_rgcn) + b
5. Extracts direct shared-target mechanism paths (drug -> target -> disease)
   with explicit source-backed weights and association scores.
6. Returns explicit MODEL_PREDICTION data mode and regulatory disclaimer.
7. Preserves complete isolation from production V4/V5 pipelines.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch

from app.services.gnn.v6_connectivity_aware_service import (
    build_connectivity_aware_features,
)
from app.services.gnn.v6_experimentation import (
    V6TwoHopBaselineScorer,
    normalize_disease_canonical,
)
from app.services.gnn.v6_hybrid_ranking_service import (
    RegularizedLogisticRanker,
    TrainingFeatureScaler,
)
from app.services.gnn.v6_rgcn_service import V6RGCNModel, V6TensorGraph

REGULATORY_NOTICE = (
    "Computational model prediction only. Not clinically validated. "
    "Not approved for diagnostic, therapeutic, or clinical prescribing use."
)

SCORE_SEMANTICS_DISCLAIMER = (
    "Uncalibrated relative ranking score computed via monotonic logistic sigmoid "
    "transformation of ranking logit. Indicates relative ordering among candidates only; "
    "not a calibrated probability of clinical efficacy, therapeutic outcome, or FDA approval."
)

INDICATION_SEMANTICS_DISCLAIMER = {
    "recordedInCuratedLabels": (
        "Candidate pair is documented in curated reference datasets (ChEMBL indications / OpenTargets)."
    ),
    "absentFromCuratedLabels": (
        "Candidate pair is absent from curated reference datasets. "
        "Absence indicates only unobserved status in training/curated graph labels, "
        "and does NOT denote therapeutic novelty, clinical efficacy, or lack of clinical efficacy."
    ),
}

EVIDENCE_SEMANTICS_DISCLAIMER = {
    "category": "COMPUTATIONAL_GRAPH_EVIDENCE",
    "disclaimer": (
        "Shared-target paths represent computational graph connectivity (Drug -> Target -> Disease) "
        "derived from curated databases (ChEMBL / OpenTargets). These are computational graph evidence "
        "paths, not clinical proof of therapeutic efficacy or validated biological mechanism."
    ),
}


def compute_sha256(file_path: Path) -> str:
    """Computes SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class V6ExperimentalRankingService:
    """Read-only service for SentinelPharma V6 connectivity-aware drug repurposing ranking."""

    def __init__(
        self,
        manifest_path: Optional[Path] = None,
        verify_hashes: bool = True,
    ):
        ai_engine_root = Path(__file__).resolve().parents[3]
        if manifest_path is None:
            self.manifest_path = (
                ai_engine_root
                / "artifacts"
                / "gnn_experiments"
                / "v6_locked_test_spec"
                / "locked_test_evaluation_manifest.json"
            )
        else:
            self.manifest_path = Path(manifest_path)

        if not self.manifest_path.exists():
            raise FileNotFoundError(
                f"Locked test evaluation manifest not found at: {self.manifest_path}"
            )

        with open(self.manifest_path, "r", encoding="utf-8") as f:
            self.manifest = json.load(f)

        # 1. Resolve and verify file paths
        graph_rel = self.manifest["frozenBiomedicalGraph"]["path"].replace("ai_engine/", "")
        self.graph_path = ai_engine_root / graph_rel
        if not self.graph_path.exists():
            raise FileNotFoundError(f"Frozen biomedical graph not found at: {self.graph_path}")

        splits_rel = self.manifest["frozenDataSplits"]["path"].replace("ai_engine/", "")
        self.splits_path = ai_engine_root / splits_rel
        if not self.splits_path.exists():
            raise FileNotFoundError(f"Frozen splits not found at: {self.splits_path}")

        primary_ckpt_rel = self.manifest["frozenCheckpoints"]["primary_best_model_seed_42"]["path"].replace("ai_engine/", "")
        self.checkpoint_path = ai_engine_root / primary_ckpt_rel
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(f"Frozen model checkpoint not found at: {self.checkpoint_path}")

        # 2. Cryptographic hash verification
        if verify_hashes:
            actual_graph_sha = compute_sha256(self.graph_path)
            expected_graph_sha = self.manifest["frozenBiomedicalGraph"]["sha256"]
            if actual_graph_sha != expected_graph_sha:
                raise ValueError(
                    f"Frozen graph SHA-256 mismatch: expected {expected_graph_sha}, got {actual_graph_sha}"
                )

            actual_splits_sha = compute_sha256(self.splits_path)
            expected_splits_sha = self.manifest["frozenDataSplits"]["sha256"]
            if actual_splits_sha != expected_splits_sha:
                raise ValueError(
                    f"Frozen splits SHA-256 mismatch: expected {expected_splits_sha}, got {actual_splits_sha}"
                )

            actual_ckpt_sha = compute_sha256(self.checkpoint_path)
            expected_ckpt_sha = self.manifest["frozenCheckpoints"]["primary_best_model_seed_42"]["sha256"]
            if actual_ckpt_sha != expected_ckpt_sha:
                raise ValueError(
                    f"Checkpoint SHA-256 mismatch: expected {expected_ckpt_sha}, got {actual_ckpt_sha}"
                )

        # 3. Load graph data
        with open(self.graph_path, "r", encoding="utf-8") as f:
            graph_data = json.load(f)

        self.entities = graph_data["entities"]
        self.relations = graph_data["relations"]

        # Entity index mappings
        self.entity_by_id: Dict[str, Dict[str, Any]] = {
            e["canonicalId"]: e for e in self.entities
        }
        self.drug_entities: List[Dict[str, Any]] = [
            e for e in self.entities if e.get("entityType") == "DRUG"
        ]
        self.disease_entities: List[Dict[str, Any]] = [
            e for e in self.entities if e.get("entityType") == "DISEASE"
        ]
        self.target_by_id: Dict[str, Dict[str, Any]] = {
            e["canonicalId"]: e for e in self.entities if e.get("entityType") == "TARGET"
        }

        # Fast lookup structures for disease resolution
        self.disease_by_id: Dict[str, Dict[str, Any]] = {
            e["canonicalId"]: e for e in self.disease_entities
        }
        self.disease_by_name: Dict[str, Dict[str, Any]] = {}
        for d in self.disease_entities:
            name = d.get("name")
            if name:
                self.disease_by_name[name.strip().lower()] = d
            for alias in d.get("aliases", []):
                if alias:
                    self.disease_by_name[alias.strip().lower()] = d

        # Fast lookup structures for drug resolution
        self.drug_by_id: Dict[str, Dict[str, Any]] = {
            e["canonicalId"]: e for e in self.drug_entities
        }
        self.drug_by_name: Dict[str, Dict[str, Any]] = {}
        for d in self.drug_entities:
            name = d.get("name")
            if name:
                self.drug_by_name[name.strip().lower()] = d
            for alias in d.get("aliases", []):
                if alias:
                    self.drug_by_name[alias.strip().lower()] = d

        # 4. Load splits and calculate training disease popularity & known indications
        with open(self.splits_path, "r", encoding="utf-8") as f:
            splits_data = json.load(f)

        self.train_disease_counts = Counter(p["disease"] for p in splits_data["train"])
        self.known_indications = {
            (p["drug"], p["disease"])
            for split_key in ("train", "val", "test")
            for p in splits_data[split_key]
        }

        # 5. Build tensor graph and two-hop scorer
        self.tg = V6TensorGraph(self.entities, self.relations)
        self.scorer = V6TwoHopBaselineScorer(self.relations)

        # 6. Load frozen R-GCN model and precompute cached node representations
        self.model = V6RGCNModel(
            num_nodes=self.tg.num_nodes,
            hidden_dim=64,
            num_relations=self.tg.num_relations,
            num_bases=4,
            dropout=0.2,
        )
        self.model.load_state_dict(
            torch.load(self.checkpoint_path, map_location="cpu")
        )
        self.model.eval()

        with torch.no_grad():
            self.h_cached = self.model.encode(
                self.tg.edge_index, self.tg.edge_type
            ).detach()

        # 7. Initialize frozen feature scaler
        self.scaler = TrainingFeatureScaler()
        self.scaler.mean = np.array(
            self.manifest["frozenFeatureScaler"]["mean"], dtype=np.float32
        )
        self.scaler.std = np.array(
            self.manifest["frozenFeatureScaler"]["std"], dtype=np.float32
        )

        # 8. Initialize frozen regularized logistic combiner
        self.ranker = RegularizedLogisticRanker(num_features=4, l2_penalty=0.01)
        w_info = self.manifest["frozenCombinerWeights"]
        self.ranker.linear.weight.data = torch.tensor(
            [w_info["weights"]], dtype=torch.float32
        )
        self.ranker.linear.bias.data = torch.tensor(
            [w_info["bias"]], dtype=torch.float32
        )

        # Pre-cache drug index list
        self.drug_ids = [d["canonicalId"] for d in self.drug_entities]
        self.drug_indices = [self.tg.node_to_idx[cid] for cid in self.drug_ids]
        self.drug_indices_tensor = torch.tensor(self.drug_indices, dtype=torch.long)

    def get_status(self) -> Dict[str, Any]:
        """Returns API status, frozen graph provenance, model architecture, and regulatory notice."""
        return {
            "ready": True,
            "service": "SentinelPharma-V6-Connectivity-Aware-Ranking-API",
            "version": "6.0.0-experimental",
            "dataMode": "MODEL_PREDICTION",
            "verificationStatus": "EXPERIMENTAL_UNVALIDATED",
            "regulatoryNotice": REGULATORY_NOTICE,
            "scoreSemantics": {
                "metric": "rankingScore",
                "type": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "description": SCORE_SEMANTICS_DISCLAIMER,
                "isClinicalProbability": False,
            },
            "indicationSemantics": INDICATION_SEMANTICS_DISCLAIMER,
            "evidenceSemantics": EVIDENCE_SEMANTICS_DISCLAIMER,
            "manifest": {
                "manifestVersion": self.manifest["manifestVersion"],
                "lockTimestamp": self.manifest["lockTimestamp"],
                "status": self.manifest["status"],
            },
            "biomedicalGraph": {
                "datasetHash": self.manifest["frozenBiomedicalGraph"]["datasetHash"],
                "sha256": self.manifest["frozenBiomedicalGraph"]["sha256"],
                "numEntities": len(self.entities),
                "numRelations": len(self.relations),
                "numDrugs": len(self.drug_entities),
                "numDiseases": len(self.disease_entities),
                "numTargets": len(self.target_by_id),
            },
            "model": {
                "architecture": self.manifest["frozenArchitecture"]["modelType"],
                "functionalForm": self.manifest["frozenArchitecture"]["functionalForm"],
                "scoreSemantics": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "weights": self.manifest["frozenCombinerWeights"]["weights"],
                "bias": self.manifest["frozenCombinerWeights"]["bias"],
                "checkpoint": {
                    "path": self.manifest["frozenCheckpoints"]["primary_best_model_seed_42"]["path"],
                    "sha256": self.manifest["frozenCheckpoints"]["primary_best_model_seed_42"]["sha256"],
                    "seed": 42,
                },
            },
        }

    def resolve_disease(self, query: str) -> Optional[Dict[str, Any]]:
        """Resolves disease identifier or name to the canonical disease entity."""
        clean = query.strip()
        if not clean:
            return None

        # Check direct canonical ID
        if clean in self.disease_by_id:
            return self.disease_by_id[clean]

        # Check normalized canonical ID
        normalized = normalize_disease_canonical(clean)
        if normalized in self.disease_by_id:
            return self.disease_by_id[normalized]

        # Check case-insensitive name / alias lookup
        lower_query = clean.lower()
        if lower_query in self.disease_by_name:
            return self.disease_by_name[lower_query]

        # Check substring match if unique
        matches = [
            d for d in self.disease_entities
            if d.get("name") and lower_query in d["name"].lower()
        ]
        if len(matches) == 1:
            return matches[0]

        return None

    def resolve_drug(self, query: str) -> Optional[Dict[str, Any]]:
        """Resolves drug identifier or name to the canonical drug entity."""
        clean = query.strip()
        if not clean:
            return None

        # Direct canonical ID
        if clean in self.drug_by_id:
            return self.drug_by_id[clean]

        # Normalized ID
        if clean.startswith("CHEMBL"):
            cand_id = f"CHEMBL:{clean}" if not clean.startswith("CHEMBL:") else clean
            if cand_id in self.drug_by_id:
                return self.drug_by_id[cand_id]

        # Case-insensitive name lookup
        lower_query = clean.lower()
        if lower_query in self.drug_by_name:
            return self.drug_by_name[lower_query]

        # Check substring match if unique
        matches = [
            d for d in self.drug_entities
            if d.get("name") and lower_query in d["name"].lower()
        ]
        if len(matches) == 1:
            return matches[0]

        return None

    def extract_shared_target_evidence(
        self, drug_id: str, disease_id: str
    ) -> List[Dict[str, Any]]:
        """Extracts direct shared-target mechanisms between drug and disease."""
        drug_targets = self.scorer.drug_targets.get(drug_id, {})
        disease_targets = self.scorer.disease_targets.get(disease_id, {})

        if not drug_targets or not disease_targets:
            return []

        common_targets = sorted(set(drug_targets.keys()) & set(disease_targets.keys()))
        evidence_list: List[Dict[str, Any]] = []

        for target_id in common_targets:
            w_drug = drug_targets[target_id]
            assoc_score = disease_targets[target_id]
            contribution = w_drug * assoc_score

            target_ent = self.target_by_id.get(target_id, {})
            target_name = target_ent.get("name", target_id)

            relation_type = (
                "DRUG_TARGET_CURATED_MECHANISM"
                if abs(w_drug - 1.0) < 1e-4
                else "DRUG_TARGET_BIOACTIVITY"
            )

            evidence_list.append({
                "targetId": target_id,
                "targetName": target_name,
                "drugRelationType": relation_type,
                "drugTargetWeight": round(float(w_drug), 4),
                "diseaseAssociationScore": round(float(assoc_score), 4),
                "pathContribution": round(float(contribution), 4),
                "evidenceCategory": "COMPUTATIONAL_GRAPH_EVIDENCE",
                "evidenceType": "COMPUTATIONAL_GRAPH_EDGE",
                "evidenceInterpretation": (
                    "Computational graph connectivity; not clinical proof of therapeutic efficacy."
                ),
            })

        evidence_list.sort(key=lambda item: item["pathContribution"], reverse=True)
        return evidence_list

    def rank_candidates(
        self,
        disease_query: str,
        top_k: int = 20,
        exclude_known_indications: bool = False,
    ) -> Dict[str, Any]:
        """Ranks candidate drugs for a disease using the frozen connectivity-aware hybrid ranker."""
        disease_ent = self.resolve_disease(disease_query)
        if disease_ent is None:
            raise ValueError(
                f"Unsupported disease: '{disease_query}' not found in the frozen V6 biomedical graph."
            )

        disease_id = disease_ent["canonicalId"]
        disease_name = disease_ent.get("name", disease_id)
        dis_node_idx = self.tg.node_to_idx[disease_id]

        # 1. R-GCN link prediction score vector
        dst_tensor = torch.full(
            (len(self.drug_indices),), dis_node_idx, dtype=torch.long
        )
        with torch.no_grad():
            rgcn_logits = self.model.decode(
                self.h_cached, self.drug_indices_tensor, dst_tensor
            )
            rgcn_scores = torch.sigmoid(rgcn_logits).cpu().numpy()

        # 2. 2-Hop shared target score vector
        s2_scores = np.array(
            [self.scorer.score_pair(cid, disease_id)[0] for cid in self.drug_ids],
            dtype=np.float32,
        )

        # 3. Disease popularity (frequency from train split)
        pop_count = int(self.train_disease_counts.get(disease_id, 0))
        pop_scores = np.full_like(s2_scores, float(pop_count))

        # 4. Connectivity-aware feature expansion: [s_2, s_pop, s_rgcn, s_2 * s_rgcn]
        raw_features = np.column_stack([s2_scores, pop_scores, rgcn_scores])
        expanded_features = build_connectivity_aware_features(raw_features)

        # 5. Transform and compute ranking logits
        norm_features = self.scaler.transform(expanded_features)
        logits = self.ranker.predict_logits(norm_features)

        # Uncalibrated relative ranking scores via monotonic sigmoid transformation: sigma(logit)
        probabilities = 1.0 / (1.0 + np.exp(-logits))

        # 6. Sort candidates descending by logit
        sorted_indices = np.argsort(logits)[::-1]

        # 7. Collect top candidates
        candidates: List[Dict[str, Any]] = []
        rank_counter = 1

        for idx in sorted_indices:
            cid = self.drug_ids[idx]
            is_known = (cid, disease_id) in self.known_indications

            if exclude_known_indications and is_known:
                continue

            drug_ent = self.entity_by_id[cid]
            evidence = self.extract_shared_target_evidence(cid, disease_id)
            is_connected = len(evidence) > 0

            candidate_record = {
                "rank": rank_counter,
                "drug": {
                    "id": cid,
                    "name": drug_ent.get("name"),
                    "aliases": drug_ent.get("aliases", []),
                    "sourceIds": drug_ent.get("sourceIds", {}),
                },
                "rankingScore": round(float(probabilities[idx]), 6),
                "scoreSemantics": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "logit": round(float(logits[idx]), 6),
                "features": {
                    "twoHopScore": round(float(s2_scores[idx]), 4),
                    "diseasePopularity": pop_count,
                    "rgcnScore": round(float(rgcn_scores[idx]), 6),
                    "rgcnProbability": round(float(rgcn_scores[idx]), 6),
                    "interactionTerm": round(float(expanded_features[idx, 3]), 6),
                },
                "isTwoHopConnected": is_connected,
                "sharedTargetCount": len(evidence),
                "sharedTargets": evidence,
                "structuralEvidenceCategory": "COMPUTATIONAL_GRAPH_EVIDENCE",
                "structuralEvidenceDisclaimer": (
                    "Computational graph paths only; not clinical proof of therapeutic efficacy."
                ),
                "isKnownIndication": is_known,
                "candidateStatus": (
                    "KNOWN_INDICATION" if is_known else "UNOBSERVED_CANDIDATE"
                ),
                "indicationStatus": (
                    "RECORDED_IN_CURATED_LABELS" if is_known else "ABSENT_FROM_CURATED_LABELS"
                ),
                "indicationProvenance": (
                    "RECORDED_IN_CURATED_GRAPH: Present in reference indication datasets."
                    if is_known
                    else "ABSENT_FROM_CURATED_GRAPH: Absent from curated reference indication datasets; does not denote therapeutic novelty, clinical efficacy, or lack of clinical efficacy."
                ),
                "dataMode": "MODEL_PREDICTION",
                "provenance": {
                    "model": "SentinelPharma-V6-ConnectivityAwareHybrid",
                    "scoreInterpretation": "Uncalibrated relative ranking score; not a clinical probability",
                    "checkpoint": "best_model_weights.pt",
                    "checkpointSeed": 42,
                    "graphDataset": "biomedical_graph_v6_frozen",
                    "manifestVersion": self.manifest["manifestVersion"],
                },
            }
            candidates.append(candidate_record)
            rank_counter += 1

            if len(candidates) >= top_k:
                break

        return {
            "success": True,
            "dataMode": "MODEL_PREDICTION",
            "verificationStatus": "EXPERIMENTAL_UNVALIDATED",
            "regulatoryNotice": REGULATORY_NOTICE,
            "scoreSemantics": {
                "metric": "rankingScore",
                "type": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "description": SCORE_SEMANTICS_DISCLAIMER,
                "isClinicalProbability": False,
            },
            "indicationSemantics": INDICATION_SEMANTICS_DISCLAIMER,
            "evidenceSemantics": EVIDENCE_SEMANTICS_DISCLAIMER,
            "disease": {
                "id": disease_id,
                "name": disease_name,
                "trainingPopularity": pop_count,
                "therapeuticAreas": disease_ent.get("provenance", [{}])[0].get(
                    "metadata", {}
                ).get("therapeuticAreas", []),
            },
            "totalCandidatesScored": len(self.drug_ids),
            "candidatesReturned": len(candidates),
            "topK": top_k,
            "excludeKnownIndications": exclude_known_indications,
            "candidates": candidates,
            "modelMetadata": {
                "architecture": self.manifest["frozenArchitecture"]["modelType"],
                "functionalForm": self.manifest["frozenArchitecture"]["functionalForm"],
                "scoreSemantics": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "manifestVersion": self.manifest["manifestVersion"],
                "checkpointSha256": self.manifest["frozenCheckpoints"][
                    "primary_best_model_seed_42"
                ]["sha256"],
                "graphDatasetHash": self.manifest["frozenBiomedicalGraph"]["datasetHash"],
            },
        }

    def score_candidate_pair(
        self, drug_query: str, disease_query: str
    ) -> Dict[str, Any]:
        """Evaluates a single drug-disease candidate pair with full mechanism evidence."""
        disease_ent = self.resolve_disease(disease_query)
        if disease_ent is None:
            raise ValueError(
                f"Unsupported disease: '{disease_query}' not found in the frozen V6 biomedical graph."
            )

        drug_ent = self.resolve_drug(drug_query)
        if drug_ent is None:
            raise ValueError(
                f"Unsupported drug: '{drug_query}' not found in the frozen V6 biomedical graph."
            )

        disease_id = disease_ent["canonicalId"]
        drug_id = drug_ent["canonicalId"]

        dis_node_idx = self.tg.node_to_idx[disease_id]
        drug_node_idx = self.tg.node_to_idx[drug_id]

        # 1. R-GCN link prediction
        src_tensor = torch.tensor([drug_node_idx], dtype=torch.long)
        dst_tensor = torch.tensor([dis_node_idx], dtype=torch.long)
        with torch.no_grad():
            rgcn_logit = self.model.decode(self.h_cached, src_tensor, dst_tensor)
            rgcn_prob = float(torch.sigmoid(rgcn_logit).cpu().item())

        # 2. 2-Hop score
        s2_val, count = self.scorer.score_pair(drug_id, disease_id)

        # 3. Disease popularity
        pop_count = int(self.train_disease_counts.get(disease_id, 0))

        # 4. Features: [s2, pop, rgcn, s2 * rgcn]
        raw_features = np.array(
            [[float(s2_val), float(pop_count), rgcn_prob]], dtype=np.float32
        )
        expanded_features = build_connectivity_aware_features(raw_features)

        # 5. Transform and compute logit and probability
        norm_features = self.scaler.transform(expanded_features)
        logit = float(self.ranker.predict_logits(norm_features)[0])
        prob = float(1.0 / (1.0 + np.exp(-logit)))

        # Evidence
        evidence = self.extract_shared_target_evidence(drug_id, disease_id)
        is_known = (drug_id, disease_id) in self.known_indications

        return {
            "success": True,
            "dataMode": "MODEL_PREDICTION",
            "verificationStatus": "EXPERIMENTAL_UNVALIDATED",
            "regulatoryNotice": REGULATORY_NOTICE,
            "scoreSemantics": {
                "metric": "rankingScore",
                "type": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
                "description": SCORE_SEMANTICS_DISCLAIMER,
                "isClinicalProbability": False,
            },
            "indicationSemantics": INDICATION_SEMANTICS_DISCLAIMER,
            "evidenceSemantics": EVIDENCE_SEMANTICS_DISCLAIMER,
            "disease": {
                "id": disease_id,
                "name": disease_ent.get("name", disease_id),
                "trainingPopularity": pop_count,
            },
            "drug": {
                "id": drug_id,
                "name": drug_ent.get("name"),
                "aliases": drug_ent.get("aliases", []),
                "sourceIds": drug_ent.get("sourceIds", {}),
            },
            "rankingScore": round(prob, 6),
            "scoreSemantics": "UNCALIBRATED_RELATIVE_RANKING_SCORE",
            "logit": round(logit, 6),
            "features": {
                "twoHopScore": round(float(s2_val), 4),
                "diseasePopularity": pop_count,
                "rgcnScore": round(rgcn_prob, 6),
                "rgcnProbability": round(rgcn_prob, 6),
                "interactionTerm": round(float(expanded_features[0, 3]), 6),
            },
            "isTwoHopConnected": len(evidence) > 0,
            "sharedTargetCount": len(evidence),
            "sharedTargets": evidence,
            "structuralEvidenceCategory": "COMPUTATIONAL_GRAPH_EVIDENCE",
            "structuralEvidenceDisclaimer": (
                "Computational graph paths only; not clinical proof of therapeutic efficacy."
            ),
            "isKnownIndication": is_known,
            "candidateStatus": (
                "KNOWN_INDICATION" if is_known else "UNOBSERVED_CANDIDATE"
            ),
            "indicationStatus": (
                "RECORDED_IN_CURATED_LABELS" if is_known else "ABSENT_FROM_CURATED_LABELS"
            ),
            "indicationProvenance": (
                "RECORDED_IN_CURATED_GRAPH: Present in reference indication datasets."
                if is_known
                else "ABSENT_FROM_CURATED_GRAPH: Absent from curated reference indication datasets; does not denote therapeutic novelty, clinical efficacy, or lack of clinical efficacy."
            ),
            "provenance": {
                "model": "SentinelPharma-V6-ConnectivityAwareHybrid",
                "scoreInterpretation": "Uncalibrated relative ranking score; not a clinical probability",
                "checkpoint": "best_model_weights.pt",
                "checkpointSeed": 42,
                "graphDataset": "biomedical_graph_v6_frozen",
                "manifestVersion": self.manifest["manifestVersion"],
            },
        }

