"""Read-only diagnostics for experimental V4 candidate-ranking collapse."""
from __future__ import annotations

import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch

from app.services.gnn.v4_candidate_ranker import CandidateRanker


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _vector_hash(vector: torch.Tensor) -> str:
    return hashlib.sha256(vector.detach().cpu().contiguous().numpy().tobytes()).hexdigest()


def _cosine(left: torch.Tensor, right: torch.Tensor) -> float:
    denominator = float(torch.linalg.vector_norm(left) * torch.linalg.vector_norm(right))
    return float(torch.dot(left, right) / denominator) if denominator else 0.0


def _incident_degrees(ranker: CandidateRanker, identifier: str) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for relation in ("DRUG_INDICATION", "DRUG_TARGET", "DISEASE_TARGET", "TARGET_PATHWAY"):
        result[relation] = {
            "outgoing": sum(edge["relationType"] == relation and edge["source"] == identifier for edge in ranker.graph["relations"]),
            "incoming": sum(edge["relationType"] == relation and edge["target"] == identifier for edge in ranker.graph["relations"]),
        }
    return result


def _connected(ranker: CandidateRanker, identifier: str) -> bool:
    return any(edge["source"] == identifier or edge["target"] == identifier for edge in ranker.graph["relations"])


def _signature(ranker: CandidateRanker, identifier: str) -> tuple[str, str]:
    """One-hop, feature-aware structural signature used only for diagnosis."""
    neighbors = []
    for edge in ranker.graph["relations"]:
        if edge["source"] == identifier:
            neighbor, direction = edge["target"], "out"
        elif edge["target"] == identifier:
            neighbor, direction = edge["source"], "in"
        else:
            continue
        vector = tuple(float(value) for value in ranker.graph["x"][ranker.graph["index"][neighbor]].tolist())
        neighbors.append((direction, edge["relationType"], ranker.dataset.nodes[neighbor], vector))
    payload = {"nodeType": ranker.dataset.nodes[identifier], "neighbors": sorted(neighbors)}
    return _hash(payload), json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _feature_groups(ranker: CandidateRanker) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for disease in ranker.dataset.diseases:
        vector = tuple(float(value) for value in ranker.graph["x"][ranker.graph["index"][disease]].tolist())
        groups[_hash(vector)].append(disease)
    return {key: sorted(value) for key, value in sorted(groups.items())}


def _disease_audit(ranker: CandidateRanker, candidate: dict[str, Any]) -> dict[str, Any]:
    disease = candidate["disease"]["id"]
    index = ranker.graph["index"][disease]
    embedding = ranker.embeddings[index]
    signature_hash, signature = _signature(ranker, disease)
    logit = float(ranker.predictor(ranker.embeddings[ranker.graph["index"][candidate["drug"]["id"]]].unsqueeze(0), embedding.unsqueeze(0)).item())
    return {
        "disease": candidate["disease"], "nodeIndex": index,
        "inputFeatureVector": [float(value) for value in ranker.graph["x"][index].tolist()],
        "degreeByRelationType": _incident_degrees(ranker, disease),
        "diseaseTargetCount": sum(edge["relationType"] == "DISEASE_TARGET" and edge["target"] == disease for edge in ranker.graph["relations"]),
        "trainingIndicationCount": sum(edge["relationType"] == "DRUG_INDICATION" and edge["target"] == disease for edge in ranker.graph["relations"]),
        "connected": _connected(ranker, disease), "structuralNeighborhoodSignatureHash": signature_hash,
        "structuralNeighborhoodSignature": signature, "embeddingHash": _vector_hash(embedding),
        "embeddingNorm": float(torch.linalg.vector_norm(embedding)), "linkPredictorLogit": logit,
        "modelScore": candidate["modelScore"],
    }


def _embedding_groups(rows: list[dict[str, Any]], *, tolerance: float = 1e-7) -> tuple[list[list[str]], list[list[str]], list[dict[str, Any]]]:
    exact: dict[str, list[str]] = defaultdict(list)
    for row in rows: exact[row["embeddingHash"]].append(row["disease"]["id"])
    exact_groups = [group for group in exact.values() if len(group) > 1]
    vectors = {row["disease"]["id"]: row for row in rows}
    near_groups, pairwise = [], []
    unseen = set(vectors)
    while unseen:
        seed = min(unseen); unseen.remove(seed); group = [seed]
        for other in sorted(list(unseen)):
            # Exact hashes are reported separately; near means cosine and L-infinity proximity.
            left = torch.tensor(rows[[row["disease"]["id"] for row in rows].index(seed)]["inputFeatureVector"])
            # Embeddings are represented by hash/norm in reports, recomputed below in caller pairwise.
            _ = left
        if len(group) > 1: near_groups.append(group)
    # Pairwise cosine is assembled by caller with actual embeddings; this placeholder keeps the contract local.
    return exact_groups, near_groups, pairwise


def _control_drugs(ranker: CandidateRanker) -> list[dict[str, Any]]:
    degrees = [(sum(edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug for edge in ranker.graph["relations"]), drug) for drug in ranker.dataset.drugs]
    nonzero = sorted((degree, drug) for degree, drug in degrees if degree > 0)
    selected = [("cetirizine", "CHEMBL:CHEMBL1000")]
    if nonzero:
        selected.extend([("highest_drug_target_degree", max(nonzero)), ("median_nonzero_drug_target_degree", nonzero[(len(nonzero) - 1) // 2])])
    output = []
    for label, value in selected:
        drug = value[1] if isinstance(value, tuple) else value
        scores = [ranker._score(drug, disease) for disease in ranker.dataset.diseases if (drug, disease) not in ranker.dataset.positive_set]
        frequencies: dict[str, int] = defaultdict(int)
        for score in scores: frequencies[float(score).hex()] += 1
        output.append({"selection": label, "drug": ranker._named_entity(drug), "drugTargetDegree": sum(edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug for edge in ranker.graph["relations"]), "candidateCount": len(scores), "uniqueScoreCount": len(frequencies), "largestTieGroup": max(frequencies.values()), "scoreStd": statistics.pstdev(scores) if len(scores) > 1 else 0.0})
    return output


def audit_ranker(ranker: CandidateRanker) -> dict[str, Any]:
    drug = "CHEMBL:CHEMBL1000"
    candidates = ranker.rank_candidates(drug, len(ranker.dataset.diseases))
    top = candidates[:10]
    top_rows = [_disease_audit(ranker, candidate) for candidate in top]
    drug_index = ranker.graph["index"][drug]
    drug_targets = [edge["target"] for edge in ranker.graph["relations"] if edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug]
    pathways = [edge["target"] for edge in ranker.graph["relations"] if edge["relationType"] == "TARGET_PATHWAY" and edge["source"] in drug_targets]
    frequencies: dict[str, list[str]] = defaultdict(list)
    for candidate in candidates: frequencies[float(candidate["modelScore"]).hex()].append(candidate["disease"]["id"])
    scores = [candidate["modelScore"] for candidate in candidates]
    exact_groups: dict[str, list[str]] = defaultdict(list)
    for row in top_rows: exact_groups[row["embeddingHash"]].append(row["disease"]["id"])
    duplicate_groups = [sorted(group) for group in exact_groups.values() if len(group) > 1]
    pairwise = []
    near_pairs = []
    for position, left in enumerate(top_rows):
        for right in top_rows[position + 1:]:
            left_embedding = ranker.embeddings[left["nodeIndex"]]; right_embedding = ranker.embeddings[right["nodeIndex"]]
            cosine, linf = _cosine(left_embedding, right_embedding), float(torch.max(torch.abs(left_embedding - right_embedding)))
            item = {"left": left["disease"]["id"], "right": right["disease"]["id"], "cosineSimilarity": cosine, "lInfinityDistance": linf}
            pairwise.append(item)
            if left["embeddingHash"] != right["embeddingHash"] and cosine >= 1 - 1e-8 and linf <= 1e-7: near_pairs.append(item)
    feature_groups = _feature_groups(ranker)
    disease_target = {disease: sum(edge["relationType"] == "DISEASE_TARGET" and edge["target"] == disease for edge in ranker.graph["relations"]) for disease in ranker.dataset.diseases}
    indication = {disease: sum(edge["relationType"] == "DRUG_INDICATION" and edge["target"] == disease for edge in ranker.graph["relations"]) for disease in ranker.dataset.diseases}
    signatures = {_signature(ranker, disease)[0] for disease in ranker.dataset.diseases}
    tied_top = [row for row in top_rows if row["modelScore"] == top_rows[0]["modelScore"]]
    same_embeddings = len({_row["embeddingHash"] for _row in tied_top}) == 1
    root_cause = "Exact duplicate final disease embeddings among the leading tied candidates; the link predictor receives identical disease inputs, so equal scores originate before the predictor." if same_embeddings else "Leading tied candidates have distinct final embeddings; inspect link-predictor logits for score compression."
    return {
        "checkpoint": ranker.selection, "cetirizine": {"drug": ranker._named_entity(drug), "nodeIndex": drug_index, "inputFeatureVector": [float(value) for value in ranker.graph["x"][drug_index].tolist()], "degreeByRelationType": _incident_degrees(ranker, drug), "drugTargetNeighbors": drug_targets, "trainingIndicationNeighbors": [edge["target"] for edge in ranker.graph["relations"] if edge["relationType"] == "DRUG_INDICATION" and edge["source"] == drug], "pathwayReachableNodes": pathways, "hasTargetPathwayStructure": bool(drug_targets or pathways), "embeddingHash": _vector_hash(ranker.embeddings[drug_index]), "embeddingNorm": float(torch.linalg.vector_norm(ranker.embeddings[drug_index]))},
        "top10DiseaseAudit": top_rows,
        "embeddingAudit": {"exactDuplicateEmbeddingGroups": duplicate_groups, "nearDuplicateTolerance": {"cosineAtLeast": 1 - 1e-8, "lInfinityAtMost": 1e-7}, "nearDuplicatePairs": near_pairs, "pairwiseCosine": pairwise},
        "scoreDistribution": {"candidateCount": len(scores), "uniqueScoreCount": len(frequencies), "exactTieExcess": len(scores) - len(frequencies), "largestTieGroup": max(len(group) for group in frequencies.values()), "min": min(scores), "max": max(scores), "mean": statistics.mean(scores), "median": statistics.median(scores), "std": statistics.pstdev(scores), "frequency": [{"scoreHex": key, "score": float.fromhex(key), "count": len(value), "diseaseIds": sorted(value)} for key, value in sorted(frequencies.items())]},
        "coverage": {"diseasesTotal": len(ranker.dataset.diseases), "diseasesWithDiseaseTarget": sum(value > 0 for value in disease_target.values()), "diseasesWithoutDiseaseTarget": sum(value == 0 for value in disease_target.values()), "diseasesWithTrainingIndication": sum(value > 0 for value in indication.values()), "diseasesWithoutTrainingIndication": sum(value == 0 for value in indication.values()), "fullyIsolatedDiseases": sum(not _connected(ranker, disease) for disease in ranker.dataset.diseases), "uniqueDiseaseStructuralSignatures": len(signatures), "drugsWithDrugTarget": sum(any(edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug for edge in ranker.graph["relations"]) for drug in ranker.dataset.drugs), "drugsWithoutDrugTarget": sum(not any(edge["relationType"] == "DRUG_TARGET" and edge["source"] == drug for edge in ranker.graph["relations"]) for drug in ranker.dataset.drugs)},
        "featureCollision": {"uniqueDiseaseFeatureVectors": len(feature_groups), "largestFeatureCollision": max(len(group) for group in feature_groups.values()), "top10FeatureHashes": {row["disease"]["id"]: _hash(row["inputFeatureVector"]) for row in top_rows}, "tiedTopShareIdenticalInputFeatures": len({_hash(row["inputFeatureVector"]) for row in tied_top}) == 1},
        "linkPredictorAudit": {"tiedCandidateCount": len(tied_top), "tiedCandidateEmbeddingHashes": sorted({row["embeddingHash"] for row in tied_top}), "tiedCandidateLogits": sorted({row["linkPredictorLogit"] for row in tied_top}), "rootCause": root_cause},
        "controlDrugs": _control_drugs(ranker),
    }


def write_audit(report: dict[str, Any], root: Path) -> Path:
    root = Path(root); root.mkdir(parents=True, exist_ok=False)
    path = root / "ranking_collapse_diagnostic.json"
    path.write_text(json.dumps({"createdAt": datetime.now(timezone.utc).isoformat(), **report}, indent=2), encoding="utf-8")
    return path
