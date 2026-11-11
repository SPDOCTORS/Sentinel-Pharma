"""SentinelPharma V6 GNN Experimentation Service.

Provides:
1. Deterministic ontology-grouped train/validation/test splitting for V6 supervision indications.
2. Leakage verification (pairwise and ontology hierarchy checks).
3. Candidate ranking pool generation with sampled unlabelled negatives and false-negative filtering.
4. 2-hop shared-target ranking baseline scorer.
5. Fixed candidate-ranking evaluation protocol reporting Coverage, MRR, Hits@K, AUPRC, and AUROC.
"""
from __future__ import annotations

import hashlib
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pyarrow.parquet as pq

# Paths
DEFAULT_FROZEN_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "biomedical_graph" / "v6_production" / "biomedical_graph_v6_frozen"
DEFAULT_OPEN_TARGETS_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "open_targets" / "26.06"
DEFAULT_EXPERIMENT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_baseline"


def compute_auprc_auroc(y_true: np.ndarray, y_scores: np.ndarray) -> Tuple[float, float]:
    """Computes AUPRC (Average Precision) and AUROC using pure NumPy vector operations."""
    y_true_arr = np.asarray(y_true, dtype=np.int32)
    y_scores_arr = np.asarray(y_scores, dtype=np.float64)

    desc_indices = np.argsort(-y_scores_arr, kind="mergesort")
    y_true_sorted = y_true_arr[desc_indices]

    n_pos = int(np.sum(y_true_arr))
    n_neg = len(y_true_arr) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.0, 0.5

    tp = np.cumsum(y_true_sorted)
    fp = np.cumsum(1 - y_true_sorted)

    recalls = tp / n_pos
    precisions = tp / (tp + fp)

    # Average Precision (AUPRC) via step integration
    recalls_padded = np.concatenate(([0.0], recalls))
    recall_diffs = np.diff(recalls_padded)
    auprc = float(np.sum(recall_diffs * precisions))

    # AUROC via trapezoid integration
    tpr = np.concatenate(([0.0], recalls, [1.0]))
    fpr = np.concatenate(([0.0], fp / n_neg, [1.0]))
    auroc = float(np.sum((fpr[1:] - fpr[:-1]) * (tpr[1:] + tpr[:-1]) / 2.0))

    return auprc, auroc


def normalize_disease_canonical(raw_id: str) -> str:
    """Standardizes disease identifiers into canonical prefix:id form."""
    raw = raw_id.strip()
    if ":" in raw:
        return raw
    for prefix in ("EFO_", "MONDO_", "DOID_", "Orphanet_", "HP_", "OTAR_"):
        if raw.startswith(prefix):
            return f"{prefix[:-1]}:{raw[len(prefix):]}"
    return f"EFO:{raw}"


class V6OntologyClusterSplitter:
    """Groups ontology-equivalent drug indication labels and partitions them deterministically."""

    def __init__(self, open_targets_dir: Path = DEFAULT_OPEN_TARGETS_DIR):
        self.open_targets_dir = Path(open_targets_dir)
        self._load_ontology()

    def _load_ontology(self) -> None:
        dis_parquet = self.open_targets_dir / "disease.parquet"
        dis_table = pq.read_table(dis_parquet, columns=["id", "ancestors", "descendants"])
        self.disease_ancestors: Dict[str, Set[str]] = {}
        self.disease_descendants: Dict[str, Set[str]] = {}

        for d_id, anc, desc in zip(dis_table["id"].to_pylist(), dis_table["ancestors"].to_pylist(), dis_table["descendants"].to_pylist()):
            c_id = normalize_disease_canonical(d_id)
            self.disease_ancestors[c_id] = set(normalize_disease_canonical(a) for a in (anc or []))
            self.disease_descendants[c_id] = set(normalize_disease_canonical(d) for d in (desc or []))

    def create_splits(
        self,
        indications: List[Dict[str, Any]],
        train_ratio: float = 0.80,
        val_ratio: float = 0.10,
        test_ratio: float = 0.10,
        seed: int = 42,
    ) -> Dict[str, Any]:
        """Groups indications by drug-level ontology DAG components and splits deterministically."""
        drug_indications: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for ind in indications:
            drug_indications[ind["drug"]].append(ind)

        clusters: List[Dict[str, Any]] = []
        for drug in sorted(drug_indications.keys()):
            inds = sorted(drug_indications[drug], key=lambda x: x["disease"])
            if len(inds) == 1:
                clusters.append({"drug": drug, "indications": inds})
                continue

            # Build adjacency between indications based on ancestor relationship
            adj = defaultdict(set)
            for i in range(len(inds)):
                d1 = inds[i]["disease"]
                a1 = self.disease_ancestors.get(d1, set())
                for j in range(i + 1, len(inds)):
                    d2 = inds[j]["disease"]
                    a2 = self.disease_ancestors.get(d2, set())
                    if d1 in a2 or d2 in a1:
                        adj[i].add(j)
                        adj[j].add(i)

            visited = set()
            for i in range(len(inds)):
                if i not in visited:
                    comp = []
                    queue = [i]
                    visited.add(i)
                    while queue:
                        curr = queue.pop()
                        comp.append(inds[curr])
                        for neighbor in adj[curr]:
                            if neighbor not in visited:
                                visited.add(neighbor)
                                queue.append(neighbor)
                    clusters.append({"drug": drug, "indications": comp})

        # Canonical sort before seeded shuffle
        clusters.sort(key=lambda c: (c["drug"], c["indications"][0]["disease"]))
        rng = random.Random(seed)
        rng.shuffle(clusters)

        n_c = len(clusters)
        idx_train = int(n_c * train_ratio)
        idx_val = int(n_c * (train_ratio + val_ratio))

        train_clusters = clusters[:idx_train]
        val_clusters = clusters[idx_train:idx_val]
        test_clusters = clusters[idx_val:]

        train_pairs = [p for c in train_clusters for p in c["indications"]]
        val_pairs = [p for c in val_clusters for p in c["indications"]]
        test_pairs = [p for c in test_clusters for p in c["indications"]]

        # Leakage checks
        train_set = {(p["drug"], p["disease"]) for p in train_pairs}
        val_set = {(p["drug"], p["disease"]) for p in val_pairs}
        test_set = {(p["drug"], p["disease"]) for p in test_pairs}

        pairwise_overlap = len(train_set & val_set) + len(train_set & test_set) + len(val_set & test_set)

        # Check ontology leakage
        ontology_leakage_count = 0
        drug_train_diseases = defaultdict(set)
        for p in train_pairs:
            drug_train_diseases[p["drug"]].add(p["disease"])

        for p in val_pairs + test_pairs:
            d, dis = p["drug"], p["disease"]
            if d in drug_train_diseases:
                anc = self.disease_ancestors.get(dis, set())
                desc = self.disease_descendants.get(dis, set())
                train_dis = drug_train_diseases[d]
                if (anc & train_dis) or (desc & train_dis):
                    ontology_leakage_count += 1

        return {
            "seed": seed,
            "ratios": {"train": train_ratio, "val": val_ratio, "test": test_ratio},
            "totalClusters": len(clusters),
            "clusterCounts": {"train": len(train_clusters), "val": len(val_clusters), "test": len(test_clusters)},
            "pairCounts": {"train": len(train_pairs), "val": len(val_pairs), "test": len(test_pairs)},
            "leakageCheck": {
                "pairwiseOverlap": pairwise_overlap,
                "ontologyHierarchyLeakage": ontology_leakage_count,
                "isLeakageFree": (pairwise_overlap == 0 and ontology_leakage_count == 0),
            },
            "splits": {
                "train": train_pairs,
                "val": val_pairs,
                "test": test_pairs,
            },
        }


class V6CandidatePoolGenerator:
    """Generates fixed candidate ranking pools (1 positive + N negatives) with false-negative filtering."""

    def __init__(
        self,
        all_diseases: List[str],
        all_indications: List[Dict[str, Any]],
        disease_ancestors: Dict[str, Set[str]],
        disease_descendants: Dict[str, Set[str]],
        negatives_per_query: int = 99,
        seed: int = 42,
    ):
        self.all_diseases = sorted(all_diseases)
        self.negatives_per_query = negatives_per_query
        self.seed = seed
        self.disease_ancestors = disease_ancestors
        self.disease_descendants = disease_descendants

        # Map each drug to all its forbidden diseases (known indications + ancestors + descendants)
        self.drug_forbidden_diseases: Dict[str, Set[str]] = defaultdict(set)
        for ind in all_indications:
            d = ind["drug"]
            dis = ind["disease"]
            self.drug_forbidden_diseases[d].add(dis)
            self.drug_forbidden_diseases[d].update(self.disease_ancestors.get(dis, set()))
            self.drug_forbidden_diseases[d].update(self.disease_descendants.get(dis, set()))

    def generate_pools(self, query_pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generates deterministic candidate pools for evaluation queries."""
        pools = []
        for i, q in enumerate(query_pairs):
            d = q["drug"]
            pos_dis = q["disease"]
            forbidden = self.drug_forbidden_diseases.get(d, set())

            # Eligible unlabelled negatives
            eligible_negatives = [dis for dis in self.all_diseases if dis not in forbidden]

            # Deterministic seeded sampling per query
            query_rng = random.Random(self.seed + i)
            sampled_negatives = query_rng.sample(eligible_negatives, min(self.negatives_per_query, len(eligible_negatives)))

            pools.append({
                "queryIndex": i,
                "drug": d,
                "positiveDisease": pos_dis,
                "maxPhaseForInd": q.get("maxPhaseForInd"),
                "candidatePool": [pos_dis] + sampled_negatives,
                "negativeCount": len(sampled_negatives),
            })
        return pools


class V6TwoHopBaselineScorer:
    """Computes weighted 2-hop shared-target scores: Drug -> Target -> Disease."""

    def __init__(self, relations: List[Dict[str, Any]]):
        self.drug_targets: Dict[str, Dict[str, float]] = defaultdict(dict)
        self.disease_targets: Dict[str, Dict[str, float]] = defaultdict(dict)

        for r in relations:
            s, t, rel = r["source"], r["target"], r["relationType"]
            if rel == "DRUG_TARGET_CURATED_MECHANISM":
                self.drug_targets[s][t] = 1.0
            elif rel == "DRUG_TARGET_BIOACTIVITY":
                prov = r.get("provenance", [{}])[0]
                std_val = prov.get("metadata", {}).get("standardValue", 500.0)
                # Affinity weighting: normalized between 0.1 and 1.0 (<= 1 uM)
                weight = max(0.1, 1.0 - (float(std_val) / 1000.0))
                # Only use bioactivity if target not already bound via curated mechanism
                if t not in self.drug_targets[s]:
                    self.drug_targets[s][t] = weight
            elif rel == "DISEASE_TARGET":
                prov = r.get("provenance", [{}])[0]
                score = prov.get("metadata", {}).get("associationScore", 0.3)
                self.disease_targets[s][t] = float(score)

    def score_pair(self, drug: str, disease: str) -> Tuple[float, int]:
        """Calculates 2-hop shared target score and common target count."""
        t_d = self.drug_targets.get(drug)
        t_di = self.disease_targets.get(disease)
        if not t_d or not t_di:
            return 0.0, 0

        common = set(t_d.keys()) & set(t_di.keys())
        if not common:
            return 0.0, 0

        score = sum(t_d[t] * t_di[t] for t in common)
        return float(score), len(common)


class V6BaselineEvaluator:
    """Evaluates candidate ranking metrics and binary classification performance."""

    def __init__(self, scorer: V6TwoHopBaselineScorer):
        self.scorer = scorer

    def evaluate_ranking_pools(self, candidate_pools: List[Dict[str, Any]]) -> Dict[str, Any]:
        ranks: List[int] = []
        reciprocal_ranks: List[float] = []
        hits_1: List[int] = []
        hits_5: List[int] = []
        hits_10: List[int] = []
        hits_20: List[int] = []
        has_2hop_path: List[bool] = []

        all_y_true: List[int] = []
        all_y_scores: List[float] = []

        phase_results: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

        for pool in candidate_pools:
            drug = pool["drug"]
            pos_dis = pool["positiveDisease"]
            phase = pool.get("maxPhaseForInd")
            phase_label = f"Phase_{int(phase)}" if phase in (1, 2, 3, 4) else "Phase_Other"

            candidates = pool["candidatePool"]

            # Score each candidate
            candidate_scores = []
            for cand in candidates:
                sc, count = self.scorer.score_pair(drug, cand)
                candidate_scores.append((cand, sc))

                is_pos = 1 if cand == pos_dis else 0
                all_y_true.append(is_pos)
                all_y_scores.append(sc)

            pos_score, pos_common = self.scorer.score_pair(drug, pos_dis)
            is_connected = (pos_score > 0.0)
            has_2hop_path.append(is_connected)

            # Sort descending by score, deterministic tie-breaking on candidate string
            candidate_scores.sort(key=lambda item: (-item[1], item[0]))

            rank = next(idx for idx, (cand, _) in enumerate(candidate_scores, start=1) if cand == pos_dis)
            rr = 1.0 / rank

            ranks.append(rank)
            reciprocal_ranks.append(rr)
            h1 = 1 if rank <= 1 else 0
            h5 = 1 if rank <= 5 else 0
            h10 = 1 if rank <= 10 else 0
            h20 = 1 if rank <= 20 else 0

            hits_1.append(h1)
            hits_5.append(h5)
            hits_10.append(h10)
            hits_20.append(h20)

            # Phase stratification
            phase_results[phase_label]["rr"].append(rr)
            phase_results[phase_label]["h10"].append(h10)
            phase_results[phase_label]["has_path"].append(1.0 if is_connected else 0.0)

        # Classification metrics
        all_y_true_arr = np.array(all_y_true)
        all_y_scores_arr = np.array(all_y_scores)

        auprc, auroc = compute_auprc_auroc(all_y_true_arr, all_y_scores_arr)

        coverage_pct = float(np.mean(has_2hop_path) * 100)
        mrr = float(np.mean(reciprocal_ranks))
        h1_pct = float(np.mean(hits_1) * 100)
        h5_pct = float(np.mean(hits_5) * 100)
        h10_pct = float(np.mean(hits_10) * 100)
        h20_pct = float(np.mean(hits_20) * 100)

        # Phase breakdown summary
        phase_summary = {}
        for p_name, vals in sorted(phase_results.items()):
            phase_summary[p_name] = {
                "count": len(vals["rr"]),
                "coveragePercent": round(float(np.mean(vals["has_path"]) * 100), 2),
                "mrr": round(float(np.mean(vals["rr"])), 4),
                "hitsAt10Percent": round(float(np.mean(vals["h10"]) * 100), 2),
            }

        # Subgroup: 2-hop connected vs disconnected
        connected_idx = [i for i, c in enumerate(has_2hop_path) if c]
        disconnected_idx = [i for i, c in enumerate(has_2hop_path) if not c]

        connected_mrr = float(np.mean([reciprocal_ranks[i] for i in connected_idx])) if connected_idx else 0.0
        connected_h10 = float(np.mean([hits_10[i] for i in connected_idx]) * 100) if connected_idx else 0.0
        disconnected_mrr = float(np.mean([reciprocal_ranks[i] for i in disconnected_idx])) if disconnected_idx else 0.0
        disconnected_h10 = float(np.mean([hits_10[i] for i in disconnected_idx]) * 100) if disconnected_idx else 0.0

        return {
            "queryCount": len(candidate_pools),
            "candidatePoolSize": len(candidate_pools[0]["candidatePool"]) if candidate_pools else 0,
            "coveragePercent": round(coverage_pct, 2),
            "rankingMetrics": {
                "mrr": round(mrr, 4),
                "hitsAt1Percent": round(h1_pct, 2),
                "hitsAt5Percent": round(h5_pct, 2),
                "hitsAt10Percent": round(h10_pct, 2),
                "hitsAt20Percent": round(h20_pct, 2),
            },
            "classificationMetrics": {
                "auprc": round(auprc, 4),
                "auroc": round(auroc, 4),
                "positiveCount": int(np.sum(all_y_true_arr)),
                "negativeCount": int(len(all_y_true_arr) - np.sum(all_y_true_arr)),
            },
            "subgroupAnalysis": {
                "twoHopConnected": {
                    "count": len(connected_idx),
                    "percent": round(len(connected_idx) / len(candidate_pools) * 100, 2),
                    "mrr": round(connected_mrr, 4),
                    "hitsAt10Percent": round(connected_h10, 2),
                },
                "twoHopDisconnected": {
                    "count": len(disconnected_idx),
                    "percent": round(len(disconnected_idx) / len(candidate_pools) * 100, 2),
                    "mrr": round(disconnected_mrr, 4),
                    "hitsAt10Percent": round(disconnected_h10, 2),
                    "note": "Represents indications requiring multi-hop message passing; 2-hop baseline score collapses to 0.0",
                },
            },
            "phaseStratification": phase_summary,
        }
