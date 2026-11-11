"""SentinelPharma V6 Hard Negative Evaluation Runner.

Executes:
1. Deterministic generation of frequency-matched, ontology-aware hard-negative candidate pools (val only).
2. Difficulty audit contrasting Uniform pools vs Hard pools.
3. Comparative evaluation of Frozen V6 R-GCN, Disease Popularity, Shuffled Control, and 2-Hop Baseline on identical pools.
4. Non-parametric bootstrap confidence intervals (95% CI, 1000 resamples) for MRR, Hits@10, and AUPRC.
5. Subgroup stratification: 2-hop connected vs 2-hop disconnected queries.
6. Persists artifacts to artifacts/gnn_experiments/v6_hard_eval/.
"""
import argparse
import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

# Add project root and ai_engine root
AI_ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_ROOT))

import numpy as np
import pyarrow.parquet as pq
import torch

from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    V6TwoHopBaselineScorer,
    normalize_disease_canonical,
)
from app.services.gnn.v6_hard_negative_eval import (
    HARD_EVAL_OUTPUT_DIR,
    V6HardCandidatePoolGenerator,
    compute_candidate_difficulty,
    evaluate_model_on_pools,
)
from app.services.gnn.v6_rgcn_service import (
    OUTPUT_RGCN_DIR,
    V6RGCNModel,
    V6RGCNTrainer,
    V6TensorGraph,
)


def load_disease_ontology_metadata(open_targets_dir: Path) -> Tuple[Dict[str, Set[str]], Dict[str, Set[str]], Dict[str, Set[str]]]:
    """Extracts therapeutic areas, ancestors, and descendants for all diseases from Open Targets parquet."""
    dis_parquet = open_targets_dir / "disease.parquet"
    table = pq.read_table(dis_parquet, columns=["id", "therapeuticAreas", "ancestors", "descendants"])

    disease_ta: Dict[str, Set[str]] = {}
    disease_anc: Dict[str, Set[str]] = {}
    disease_desc: Dict[str, Set[str]] = {}

    for did, tas, anc, desc in zip(
        table["id"].to_pylist(),
        table["therapeuticAreas"].to_pylist(),
        table["ancestors"].to_pylist(),
        table["descendants"].to_pylist(),
    ):
        cid = normalize_disease_canonical(did)
        disease_ta[cid] = set(normalize_disease_canonical(t) for t in (tas or []))
        disease_anc[cid] = set(normalize_disease_canonical(a) for a in (anc or []))
        disease_desc[cid] = set(normalize_disease_canonical(d) for d in (desc or []))

    return disease_ta, disease_anc, disease_desc


def get_or_train_shuffled_control_model(
    tensor_graph: V6TensorGraph,
    train_pairs: list,
    all_disease_indices: list,
    weights_path: Path,
    seed: int = 42,
    epochs: int = 10,
) -> V6RGCNModel:
    """Loads cached shuffled control weights or trains deterministically if not present."""
    torch.manual_seed(seed)
    model = V6RGCNModel(
        num_nodes=tensor_graph.num_nodes,
        hidden_dim=64,
        num_relations=tensor_graph.num_relations,
        num_bases=4,
        dropout=0.2,
    )

    if weights_path.exists():
        print(f"  Loading cached shuffled-label control model weights from: {weights_path}")
        model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        model.eval()
        return model

    print(f"  Training deterministic shuffled-label control model ({epochs} epochs, seed={seed})...")
    rng = random.Random(seed)
    drugs = [p["drug"] for p in train_pairs]
    rng.shuffle(drugs)
    shuffled_train_pairs = [{"drug": d, "disease": p["disease"]} for d, p in zip(drugs, train_pairs)]

    trainer = V6RGCNTrainer(tensor_graph=tensor_graph, model=model, learning_rate=0.01, device="cpu")
    for ep in range(1, epochs + 1):
        trainer.train_epoch(shuffled_train_pairs, all_disease_indices, seed=seed + ep)

    weights_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), weights_path)
    print(f"  Saved shuffled control weights to: {weights_path}")
    model.eval()
    return model


def main():
    parser = argparse.ArgumentParser(description="Evaluate SentinelPharma V6 models on hard negative pools")
    parser.add_argument("--frozen-dir", type=Path, default=DEFAULT_FROZEN_DIR, help="Path to frozen V6 graph directory")
    parser.add_argument("--experiment-dir", type=Path, default=DEFAULT_EXPERIMENT_DIR, help="Path to baseline experiment artifacts")
    parser.add_argument("--rgcn-dir", type=Path, default=OUTPUT_RGCN_DIR, help="Path to trained R-GCN artifacts")
    parser.add_argument("--open-targets-dir", type=Path, default=DEFAULT_OPEN_TARGETS_DIR, help="Path to Open Targets 26.06 dir")
    parser.add_argument("--output-dir", type=Path, default=HARD_EVAL_OUTPUT_DIR, help="Path to output hard eval directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--bootstraps", type=int, default=1000, help="Number of bootstrap resamples")
    args = parser.parse_args()

    print("=================================================================")
    print("      SentinelPharma V6: Hard Negative Validation Benchmark      ")
    print("=================================================================")
    print(f"Frozen Graph Dir:        {args.frozen_dir}")
    print(f"Baseline Experiment Dir: {args.experiment_dir}")
    print(f"Trained R-GCN Dir:       {args.rgcn_dir}")
    print(f"Open Targets Dir:        {args.open_targets_dir}")
    print(f"Output Hard Eval Dir:    {args.output_dir}")
    print(f"Bootstrap Resamples:     {args.bootstraps}")
    print("-----------------------------------------------------------------")

    t0 = time.time()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load Frozen Artifacts & Splits
    print("\n[1/6] Loading frozen graph, ontology metadata, and splits...")
    with open(args.frozen_dir / "graph.json", "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(args.experiment_dir / "splits.json", "r", encoding="utf-8") as f:
        splits = json.load(f)
    with open(args.experiment_dir / "candidate_ranking_pool.json", "r", encoding="utf-8") as f:
        uniform_pools_data = json.load(f)

    entities = graph["entities"]
    relations = graph["relations"]
    train_pairs = splits["train"]
    val_queries = splits["val"]
    all_indications = splits["train"] + splits["val"] + splits["test"]

    print(f"  Loaded {len(entities):,} entities, {len(relations):,} relations.")
    print(f"  Train Indications: {len(train_pairs):,} | Val Queries: {len(val_queries):,}")

    # Build disease training frequencies
    train_counts = Counter(p["disease"] for p in train_pairs)
    all_diseases = [e["canonicalId"] for e in entities if e["entityType"] == "DISEASE"]

    # Load ontology metadata
    disease_ta, disease_anc, disease_desc = load_disease_ontology_metadata(args.open_targets_dir)

    # Initialize 2-hop scorer
    two_hop_scorer = V6TwoHopBaselineScorer(relations)

    # 2. Generate Hard Negative Candidate Pools
    print("\n[2/6] Generating deterministic frequency-matched, ontology-aware hard negative candidate pools...")
    pool_gen = V6HardCandidatePoolGenerator(
        all_diseases=all_diseases,
        all_indications=all_indications,
        disease_ancestors=disease_anc,
        disease_descendants=disease_desc,
        disease_therapeutic_areas=disease_ta,
        train_disease_frequencies=train_counts,
        negatives_per_query=99,
        seed=args.seed,
    )

    hard_val_pools = pool_gen.generate_pools(val_queries)

    # Tag both hard and uniform pools with 2-hop connectivity
    for pool in hard_val_pools:
        sc, _ = two_hop_scorer.score_pair(pool["drug"], pool["positiveDisease"])
        pool["isTwoHopConnected"] = (sc > 0.0)

    uniform_val_pools = uniform_pools_data["valQueries"]
    for pool in uniform_val_pools:
        sc, _ = two_hop_scorer.score_pair(pool["drug"], pool["positiveDisease"])
        pool["isTwoHopConnected"] = (sc > 0.0)

    # Save hard candidate ranking pools
    hard_pool_path = args.output_dir / "hard_candidate_ranking_pool.json"
    with open(hard_pool_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "poolVersion": "v6-hard-frequency-matched-ontology-aware-v1",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "queryCount": len(hard_val_pools),
                "negativesPerQuery": 99,
                "candidatePoolSize": 100,
                "valQueries": hard_val_pools,
            },
            f,
            indent=2,
        )
    print(f"  Persisted hard candidate pools to: {hard_pool_path}")

    # 3. Candidate Difficulty Audit
    print("\n[3/6] Computing candidate difficulty metrics (Uniform vs Hard pools)...")
    uniform_difficulty = compute_candidate_difficulty(uniform_val_pools, train_counts, disease_ta)
    hard_difficulty = compute_candidate_difficulty(hard_val_pools, train_counts, disease_ta)

    print("  Difficulty Comparison:")
    print(f"    Mean |f_pos - f_neg|:           Uniform = {uniform_difficulty['meanFrequencyDifference']:.2f}  -->  Hard = {hard_difficulty['meanFrequencyDifference']:.2f}")
    print(f"    Therapeutic Area Overlap:        Uniform = {uniform_difficulty['meanTherapeuticAreaOverlapPercent']:.2f}%  -->  Hard = {hard_difficulty['meanTherapeuticAreaOverlapPercent']:.2f}%")
    print(f"    Active Candidates (freq > 0):    Uniform = {uniform_difficulty['activeCandidatePercent']:.2f}%  -->  Hard = {hard_difficulty['activeCandidatePercent']:.2f}%")
    print(f"    Exact Frequency Tier Match:      Uniform = {uniform_difficulty['exactFrequencyTierMatchPercent']:.2f}%  -->  Hard = {hard_difficulty['exactFrequencyTierMatchPercent']:.2f}%")

    # 4. Prepare Models & Scoring Functions
    print("\n[4/6] Initializing models and scoring functions...")
    tensor_graph = V6TensorGraph(entities, relations)
    all_disease_indices = [tensor_graph.node_to_idx[d] for d in all_diseases]

    # Model 1: Frozen V6 R-GCN
    print("  Loading frozen V6 R-GCN weights...")
    rgcn_model = V6RGCNModel(
        num_nodes=tensor_graph.num_nodes,
        hidden_dim=64,
        num_relations=tensor_graph.num_relations,
        num_bases=4,
        dropout=0.2,
    )
    rgcn_model.load_state_dict(torch.load(args.rgcn_dir / "model_weights.pt", map_location="cpu"))
    rgcn_model.eval()

    with torch.no_grad():
        h_rgcn = rgcn_model.encode(tensor_graph.edge_index, tensor_graph.edge_type)

    def score_rgcn(drug: str, candidates: list) -> list:
        src_idx = tensor_graph.node_to_idx[drug]
        dst_idx = [tensor_graph.node_to_idx[c] for c in candidates]
        src_t = torch.full((len(dst_idx),), src_idx, dtype=torch.long)
        dst_t = torch.tensor(dst_idx, dtype=torch.long)
        with torch.no_grad():
            logits = rgcn_model.decode(h_rgcn, src_t, dst_t)
            scores = torch.sigmoid(logits).cpu().numpy().tolist()
        return scores

    # Model 2: Disease Popularity Baseline
    def score_popularity(drug: str, candidates: list) -> list:
        return [float(train_counts.get(c, 0)) for c in candidates]

    # Model 3: Shuffled-Label Control
    shuffled_weights_path = args.output_dir / "shuffled_control_weights.pt"
    shuffled_model = get_or_train_shuffled_control_model(
        tensor_graph=tensor_graph,
        train_pairs=train_pairs,
        all_disease_indices=all_disease_indices,
        weights_path=shuffled_weights_path,
        seed=args.seed,
        epochs=10,
    )
    with torch.no_grad():
        h_shuffled = shuffled_model.encode(tensor_graph.edge_index, tensor_graph.edge_type)

    def score_shuffled(drug: str, candidates: list) -> list:
        src_idx = tensor_graph.node_to_idx[drug]
        dst_idx = [tensor_graph.node_to_idx[c] for c in candidates]
        src_t = torch.full((len(dst_idx),), src_idx, dtype=torch.long)
        dst_t = torch.tensor(dst_idx, dtype=torch.long)
        with torch.no_grad():
            logits = shuffled_model.decode(h_shuffled, src_t, dst_t)
            scores = torch.sigmoid(logits).cpu().numpy().tolist()
        return scores

    # Model 4: 2-Hop Shared-Target Baseline
    def score_two_hop(drug: str, candidates: list) -> list:
        return [float(two_hop_scorer.score_pair(drug, c)[0]) for c in candidates]

    # 5. Evaluate on Hard Pools & Uniform Pools
    print("\n[5/6] Running comparative evaluation with 95% Bootstrap Confidence Intervals...")

    models = [
        ("v6_rgcn_frozen", "Frozen V6 R-GCN (Trained Weights)", score_rgcn),
        ("disease_popularity", "Disease-Popularity Baseline (Marginal Frequency Prior)", score_popularity),
        ("shuffled_label_control", "Shuffled-Drug-Label Control Model", score_shuffled),
        ("two_hop_baseline", "2-Hop Shared-Target Baseline", score_two_hop),
    ]

    hard_results = {}
    uniform_results = {}

    for key, desc, s_fn in models:
        print(f"  Evaluating {desc} on HARD pools...")
        h_res = evaluate_model_on_pools(
            model_name=key,
            pools=hard_val_pools,
            score_fn=s_fn,
            n_bootstraps=args.bootstraps,
            seed=args.seed,
        )
        h_res["description"] = desc
        hard_results[key] = h_res
        print(f"    --> Hard Pool MRR: {h_res['mrr']:.4f} (95% CI: [{h_res['confidenceIntervals95']['mrr']['ci_lower']:.4f}, {h_res['confidenceIntervals95']['mrr']['ci_upper']:.4f}]) | Hits@10: {h_res['hitsAt10Percent']:.2f}% | AUPRC: {h_res['auprc']:.4f}")

        print(f"  Evaluating {desc} on UNIFORM pools...")
        u_res = evaluate_model_on_pools(
            model_name=key,
            pools=uniform_val_pools,
            score_fn=s_fn,
            n_bootstraps=args.bootstraps,
            seed=args.seed,
        )
        u_res["description"] = desc
        uniform_results[key] = u_res
        print(f"    --> Uniform Pool MRR: {u_res['mrr']:.4f} (95% CI: [{u_res['confidenceIntervals95']['mrr']['ci_lower']:.4f}, {u_res['confidenceIntervals95']['mrr']['ci_upper']:.4f}]) | Hits@10: {u_res['hitsAt10Percent']:.2f}% | AUPRC: {u_res['auprc']:.4f}")

    # 6. Synthesize and Persist Metrics
    print("\n[6/6] Synthesizing comprehensive hard evaluation report...")
    out_payload = {
        "evaluationVersion": "v6-hard-negative-evaluation-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "frozenGraphDatasetHash": graph["datasetHash"],
        "validationQueryCount": len(hard_val_pools),
        "candidatePoolSize": 100,
        "candidateDifficulty": {
            "uniformPool": uniform_difficulty,
            "hardPool": hard_difficulty,
            "difficultyGain": {
                "frequencyDifferenceReduction": round(uniform_difficulty["meanFrequencyDifference"] - hard_difficulty["meanFrequencyDifference"], 2),
                "therapeuticAreaOverlapIncrease": round(hard_difficulty["meanTherapeuticAreaOverlapPercent"] - uniform_difficulty["meanTherapeuticAreaOverlapPercent"], 2),
                "activeCandidatePercentageIncrease": round(hard_difficulty["activeCandidatePercent"] - uniform_difficulty["activeCandidatePercent"], 2),
                "exactTierMatchPercentageIncrease": round(hard_difficulty["exactFrequencyTierMatchPercent"] - uniform_difficulty["exactFrequencyTierMatchPercent"], 2),
            },
        },
        "comparativeBenchmark": {
            "hardCandidatePool": hard_results,
            "uniformCandidatePool": uniform_results,
        },
    }

    metrics_path = args.output_dir / "hard_evaluation_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(out_payload, f, indent=2)

    total_time = time.time() - t0
    print(f"\n=================================================================")
    print(f"  Hard Evaluation Complete in {total_time:.1f}s!")
    print(f"  Artifacts saved to: {args.output_dir}")
    print(f"=================================================================")


if __name__ == "__main__":
    main()
