"""SentinelPharma V6 Hard Negative Candidate Evaluation Service.

Provides:
1. Deterministic disease-frequency-matched and ontology-aware hard-negative candidate generator.
2. Candidate difficulty metrics quantifying semantic and popularity hardness compared to uniform pools.
3. Comparative evaluation of Frozen R-GCN, Disease Popularity, Shuffled-Label Control, and 2-Hop Baseline.
4. Non-parametric bootstrap confidence intervals (95% CI) for MRR, Hits@10, and AUPRC across overall and subgroups.
"""
from __future__ import annotations

import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pyarrow.parquet as pq
import torch

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6TwoHopBaselineScorer,
    compute_auprc_auroc,
    normalize_disease_canonical,
)
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6RGCNModel,
    V6RGCNTrainer,
    V6TensorGraph,
)

HARD_EVAL_OUTPUT_DIR = Path(__file__).resolve().parents[3] / "artifacts" / "gnn_experiments" / "v6_hard_eval"


def get_disease_frequency_tier(freq: int) -> int:
    """Categorizes disease training frequency into discrete tiers:
    Tier 3: High Active (>= 20 training indications)
    Tier 2: Medium Active (5 - 19 training indications)
    Tier 1: Low Active (1 - 4 training indications)
    Tier 0: Inactive (0 training indications)
    """
    if freq >= 20:
        return 3
    if freq >= 5:
        return 2
    if freq >= 1:
        return 1
    return 0


class V6HardCandidatePoolGenerator:
    """Generates deterministic disease-frequency-matched and ontology-aware candidate pools."""

    def __init__(
        self,
        all_diseases: List[str],
        all_indications: List[Dict[str, Any]],
        disease_ancestors: Dict[str, Set[str]],
        disease_descendants: Dict[str, Set[str]],
        disease_therapeutic_areas: Dict[str, Set[str]],
        train_disease_frequencies: Dict[str, int],
        negatives_per_query: int = 99,
        seed: int = 42,
    ):
        self.all_diseases = sorted(all_diseases)
        self.disease_ancestors = disease_ancestors
        self.disease_descendants = disease_descendants
        self.disease_therapeutic_areas = disease_therapeutic_areas
        self.train_disease_frequencies = train_disease_frequencies
        self.negatives_per_query = negatives_per_query
        self.seed = seed

        # Build comprehensive false-negative filter per drug across all known splits
        self.drug_forbidden_diseases: Dict[str, Set[str]] = defaultdict(set)
        for ind in all_indications:
            d = ind["drug"]
            dis = ind["disease"]
            self.drug_forbidden_diseases[d].add(dis)
            self.drug_forbidden_diseases[d].update(self.disease_ancestors.get(dis, set()))
            self.drug_forbidden_diseases[d].update(self.disease_descendants.get(dis, set()))

    def generate_pools(self, query_pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generates deterministic hard negative pools for evaluation queries."""
        pools = []

        for i, q in enumerate(query_pairs):
            drug = q["drug"]
            pos_dis = q["disease"]
            pos_freq = self.train_disease_frequencies.get(pos_dis, 0)
            pos_tier = get_disease_frequency_tier(pos_freq)
            pos_tas = self.disease_therapeutic_areas.get(pos_dis, set())
            forbidden = self.drug_forbidden_diseases.get(drug, set())

            eligible = [dis for dis in self.all_diseases if dis not in forbidden and dis != pos_dis]

            # Partition into hierarchical difficulty priority buckets:
            # Bucket 0: Same therapeutic area + exact frequency tier match
            # Bucket 1: Same therapeutic area + adjacent frequency tier match (|tier_diff| == 1)
            # Bucket 2: Different therapeutic area + exact frequency tier match
            # Bucket 3: Same therapeutic area + distant frequency tier
            # Bucket 4: Different therapeutic area + adjacent frequency tier match
            # Bucket 5: Remaining eligible candidates
            buckets: Dict[Tuple[int, ...], List[str]] = defaultdict(list)
            for cand in eligible:
                c_freq = self.train_disease_frequencies.get(cand, 0)
                c_tier = get_disease_frequency_tier(c_freq)
                c_tas = self.disease_therapeutic_areas.get(cand, set())
                shares_ta = bool(c_tas & pos_tas)
                tier_diff = abs(c_tier - pos_tier)
                freq_diff = abs(c_freq - pos_freq)

                if shares_ta and tier_diff == 0:
                    priority = (0, freq_diff)
                elif shares_ta and tier_diff == 1:
                    priority = (1, freq_diff)
                elif not shares_ta and tier_diff == 0:
                    priority = (2, freq_diff)
                elif shares_ta:
                    priority = (3, tier_diff, freq_diff)
                elif tier_diff == 1:
                    priority = (4, freq_diff)
                else:
                    priority = (5, tier_diff, freq_diff)
                buckets[priority].append(cand)

            # Sample deterministically with seeded RNG per query
            rng = random.Random(self.seed + i)
            sampled_negatives: List[str] = []

            for priority_key in sorted(buckets.keys()):
                bucket_cands = sorted(buckets[priority_key])  # Canonical tie-breaker
                rng.shuffle(bucket_cands)
                needed = self.negatives_per_query - len(sampled_negatives)
                sampled_negatives.extend(bucket_cands[:needed])
                if len(sampled_negatives) >= self.negatives_per_query:
                    break

            pools.append({
                "queryIndex": i,
                "drug": drug,
                "positiveDisease": pos_dis,
                "maxPhaseForInd": q.get("maxPhaseForInd"),
                "candidatePool": [pos_dis] + sampled_negatives,
                "negativeCount": len(sampled_negatives),
                "isTwoHopConnected": q.get("isTwoHopConnected", False),
            })

        return pools


def compute_candidate_difficulty(
    pools: List[Dict[str, Any]],
    train_counts: Counter,
    disease_therapeutic_areas: Dict[str, Set[str]],
) -> Dict[str, Any]:
    """Computes quantitative hardness metrics for candidate ranking pools."""
    mean_freq_diffs = []
    ta_overlap_pcts = []
    active_cand_pcts = []
    exact_tier_match_pcts = []

    for pool in pools:
        pos_dis = pool["positiveDisease"]
        pos_freq = train_counts.get(pos_dis, 0)
        pos_tier = get_disease_frequency_tier(pos_freq)
        pos_tas = disease_therapeutic_areas.get(pos_dis, set())

        candidates = [c for c in pool["candidatePool"] if c != pos_dis]
        if not candidates:
            continue

        c_freqs = [train_counts.get(c, 0) for c in candidates]
        c_tiers = [get_disease_frequency_tier(f) for f in c_freqs]

        freq_diff = [abs(f - pos_freq) for f in c_freqs]
        ta_overlap = [1 if (disease_therapeutic_areas.get(c, set()) & pos_tas) else 0 for c in candidates]
        active = [1 if f > 0 else 0 for f in c_freqs]
        exact_tier = [1 if t == pos_tier else 0 for t in c_tiers]

        mean_freq_diffs.append(float(np.mean(freq_diff)))
        ta_overlap_pcts.append(float(np.mean(ta_overlap) * 100))
        active_cand_pcts.append(float(np.mean(active) * 100))
        exact_tier_match_pcts.append(float(np.mean(exact_tier) * 100))

    return {
        "meanFrequencyDifference": round(float(np.mean(mean_freq_diffs)), 2),
        "meanTherapeuticAreaOverlapPercent": round(float(np.mean(ta_overlap_pcts)), 2),
        "activeCandidatePercent": round(float(np.mean(active_cand_pcts)), 2),
        "exactFrequencyTierMatchPercent": round(float(np.mean(exact_tier_match_pcts)), 2),
    }


def compute_bootstrap_confidence_intervals(
    reciprocal_ranks: List[float],
    hits_10: List[int],
    y_true_per_query: List[List[int]],
    y_scores_per_query: List[List[float]],
    n_bootstraps: int = 1000,
    confidence_level: float = 0.95,
    seed: int = 42,
) -> Dict[str, Dict[str, float]]:
    """Computes non-parametric bootstrap confidence intervals (e.g. 95% CI) for MRR, Hits@10, and AUPRC."""
    n_queries = len(reciprocal_ranks)
    if n_queries == 0:
        return {
            "mrr": {"mean": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "std_err": 0.0},
            "hitsAt10Percent": {"mean": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "std_err": 0.0},
            "auprc": {"mean": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "std_err": 0.0},
        }

    rr_arr = np.asarray(reciprocal_ranks, dtype=np.float64)
    h10_arr = np.asarray(hits_10, dtype=np.float64) * 100.0

    y_true_mat = np.asarray(y_true_per_query, dtype=np.int32)
    y_score_mat = np.asarray(y_scores_per_query, dtype=np.float32)
    k_cand = y_true_mat.shape[1] if y_true_mat.ndim > 1 else 100

    rng = np.random.RandomState(seed)

    boot_mrr = np.zeros(n_bootstraps, dtype=np.float64)
    boot_h10 = np.zeros(n_bootstraps, dtype=np.float64)
    boot_auprc = np.zeros(n_bootstraps, dtype=np.float64)

    alpha = 1.0 - confidence_level
    lower_pct = 100.0 * (alpha / 2.0)
    upper_pct = 100.0 * (1.0 - alpha / 2.0)

    denom = np.arange(1, n_queries * k_cand + 1, dtype=np.float64)

    for b in range(n_bootstraps):
        idx = rng.randint(0, n_queries, size=n_queries)
        boot_mrr[b] = np.mean(rr_arr[idx])
        boot_h10[b] = np.mean(h10_arr[idx])

        # Vectorized AUPRC bootstrap
        yt = y_true_mat[idx].ravel()
        ys = y_score_mat[idx].ravel()
        order = np.argsort(-ys, kind="quicksort")
        yt_sorted = yt[order]
        tp = np.cumsum(yt_sorted, dtype=np.float64)
        prec = tp / denom
        diff_recall = yt_sorted.astype(np.float64) / float(n_queries)
        boot_auprc[b] = np.sum(diff_recall * prec)

    return {
        "mrr": {
            "mean": round(float(np.mean(boot_mrr)), 4),
            "ci_lower": round(float(np.percentile(boot_mrr, lower_pct)), 4),
            "ci_upper": round(float(np.percentile(boot_mrr, upper_pct)), 4),
            "std_err": round(float(np.std(boot_mrr)), 4),
        },
        "hitsAt10Percent": {
            "mean": round(float(np.mean(boot_h10)), 2),
            "ci_lower": round(float(np.percentile(boot_h10, lower_pct)), 2),
            "ci_upper": round(float(np.percentile(boot_h10, upper_pct)), 2),
            "std_err": round(float(np.std(boot_h10)), 2),
        },
        "auprc": {
            "mean": round(float(np.mean(boot_auprc)), 4),
            "ci_lower": round(float(np.percentile(boot_auprc, lower_pct)), 4),
            "ci_upper": round(float(np.percentile(boot_auprc, upper_pct)), 4),
            "std_err": round(float(np.std(boot_auprc)), 4),
        },
    }


def evaluate_model_on_pools(
    model_name: str,
    pools: List[Dict[str, Any]],
    score_fn: Any,
    n_bootstraps: int = 1000,
    seed: int = 42,
) -> Dict[str, Any]:
    """Unified evaluation harness producing rankings, metrics, subgroups, and bootstrap CIs."""
    reciprocal_ranks = []
    hits_1 = []
    hits_10 = []
    y_true_per_query = []
    y_scores_per_query = []

    subgroup_indices = {"twoHopConnected": [], "twoHopDisconnected": []}

    for i, pool in enumerate(pools):
        drug = pool["drug"]
        pos_dis = pool["positiveDisease"]
        candidates = pool["candidatePool"]
        is_conn = pool.get("isTwoHopConnected", False)
        subgroup_key = "twoHopConnected" if is_conn else "twoHopDisconnected"
        subgroup_indices[subgroup_key].append(i)

        scores = score_fn(drug, candidates)
        y_true = [1 if c == pos_dis else 0 for c in candidates]

        y_true_per_query.append(y_true)
        y_scores_per_query.append(scores)

        cand_scores = list(zip(candidates, scores))
        cand_scores.sort(key=lambda item: (-item[1], item[0]))  # Deterministic tie-breaking

        rank = next(idx for idx, (c, _) in enumerate(cand_scores, start=1) if c == pos_dis)
        rr = 1.0 / rank

        reciprocal_ranks.append(rr)
        hits_1.append(1 if rank <= 1 else 0)
        hits_10.append(1 if rank <= 10 else 0)

    # Point metrics
    all_y_true = np.array(y_true_per_query).ravel()
    all_y_scores = np.array(y_scores_per_query).ravel()
    point_auprc, point_auroc = compute_auprc_auroc(all_y_true, all_y_scores)

    # Bootstrap CIs for overall
    overall_ci = compute_bootstrap_confidence_intervals(
        reciprocal_ranks, hits_10, y_true_per_query, y_scores_per_query, n_bootstraps=n_bootstraps, seed=seed
    )

    # Subgroups
    subgroups_res = {}
    for sg_name, idxs in subgroup_indices.items():
        if not idxs:
            subgroups_res[sg_name] = {"count": 0, "mrr": 0.0, "hitsAt10Percent": 0.0, "auprc": 0.0}
            continue

        sg_rr = [reciprocal_ranks[k] for k in idxs]
        sg_h10 = [hits_10[k] for k in idxs]
        sg_y_true = [y_true_per_query[k] for k in idxs]
        sg_y_scores = [y_scores_per_query[k] for k in idxs]

        sg_flat_true = np.array(sg_y_true).ravel()
        sg_flat_scores = np.array(sg_y_scores).ravel()
        sg_auprc, _ = compute_auprc_auroc(sg_flat_true, sg_flat_scores)

        sg_ci = compute_bootstrap_confidence_intervals(
            sg_rr, sg_h10, sg_y_true, sg_y_scores, n_bootstraps=n_bootstraps, seed=seed + 1
        )

        subgroups_res[sg_name] = {
            "count": len(idxs),
            "mrr": round(float(np.mean(sg_rr)), 4),
            "hitsAt10Percent": round(float(np.mean(sg_h10) * 100), 2),
            "auprc": round(sg_auprc, 4),
            "confidenceIntervals95": sg_ci,
        }

    return {
        "modelName": model_name,
        "queryCount": len(pools),
        "mrr": round(float(np.mean(reciprocal_ranks)), 4),
        "hitsAt1Percent": round(float(np.mean(hits_1) * 100), 2),
        "hitsAt10Percent": round(float(np.mean(hits_10) * 100), 2),
        "auprc": round(point_auprc, 4),
        "auroc": round(point_auroc, 4),
        "confidenceIntervals95": overall_ci,
        "subgroups": subgroups_res,
    }
