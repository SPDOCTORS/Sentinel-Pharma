"""Offline leakage-safe GNN evaluation. This module never writes the production model artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np

from app.services.gnn.repurposing_gnn_service import (
    DEFAULT_SEED, GraphSAGEEncoder, LinkPredictor, ML_AVAILABLE, torch, F
)


def key(t: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    return (t["source"], t["relation"], t["target"], t["source_type"], t["target_type"])


def is_target(t: Dict[str, Any]) -> bool:
    return t["relation"] == "treats" and t["source_type"] == "drug" and t["target_type"] == "disease"


def set_seed(seed: int) -> None:
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed); torch.backends.cudnn.deterministic = True; torch.backends.cudnn.benchmark = False


def split_edges(triples: List[Dict[str, Any]], seed: int, validation_ratio: float = .15, test_ratio: float = .15) -> Dict[str, List[Dict[str, Any]]]:
    positives = list({key(t): t for t in triples if is_target(t)}.values())
    if len(positives) < 6: raise ValueError("Need at least six drug-disease target edges for train/validation/test evaluation")
    rng = random.Random(seed); rng.shuffle(positives)
    test_n, validation_n = max(1, round(len(positives) * test_ratio)), max(1, round(len(positives) * validation_ratio))
    test, validation = positives[:test_n], positives[test_n:test_n + validation_n]
    held_pairs = {(t["source"], t["target"]) for t in test + validation}
    # Remove every target relation for held pairs. The graph builder adds reverse edges itself,
    # so no inverse message-passing edge can survive this filtering.
    train = [t for t in triples if not (t["source_type"] == "drug" and t["target_type"] == "disease" and (t["source"], t["target"]) in held_pairs)]
    return {"train": train, "validation": validation, "test": test}


def graph(triples: List[Dict[str, Any]]) -> Dict[str, Any]:
    nodes = sorted({x for t in triples for x in (t["source"], t["target"])})
    index = {n: i for i, n in enumerate(nodes)}
    types = {t["source"]: t["source_type"] for t in triples} | {t["target"]: t["target_type"] for t in triples}
    pairs = [(index[t["source"]], index[t["target"]]) for t in triples]
    pairs += [(b, a) for a, b in pairs]
    edge_index = torch.tensor(pairs, dtype=torch.long).t().contiguous()
    type_names = sorted(set(types.values())); type_index = {name: i for i, name in enumerate(type_names)}
    x = torch.zeros((len(nodes), len(type_names) + 1), dtype=torch.float)
    degree = torch.bincount(edge_index[0], minlength=len(nodes)).float(); max_degree = max(float(degree.max()), 1.0)
    for name, idx in index.items(): x[idx, type_index[types[name]]] = 1; x[idx, -1] = degree[idx] / max_degree
    return {"index": index, "types": types, "x": x, "edge_index": edge_index}


def positives(triples: Iterable[Dict[str, Any]]) -> set[Tuple[str, str]]:
    return {(t["source"], t["target"]) for t in triples if is_target(t)}


def sample_negatives(drugs: List[str], diseases: List[str], known: set[Tuple[str, str]], count: int, rng: random.Random) -> List[Tuple[str, str]]:
    candidates = [(d, disease) for d in drugs for disease in diseases if (d, disease) not in known]
    if not candidates: raise ValueError("No unobserved drug-disease pairs available for sampled negatives")
    return [rng.choice(candidates) for _ in range(count)]


def ranking_metrics(ranks: List[int]) -> Dict[str, float]:
    return {"mrr": mean(1 / r for r in ranks), **{f"hits_at_{k}": mean(r <= k for r in ranks) for k in (1, 3, 5, 10)}}


def evaluate_seed(triples: List[Dict[str, Any]], seed: int, epochs: int, negative_ratio: int) -> Dict[str, Any]:
    if not ML_AVAILABLE: raise RuntimeError("PyTorch Geometric is unavailable")
    set_seed(seed); split = split_edges(triples, seed); g = graph(split["train"])
    drugs = sorted(n for n, typ in g["types"].items() if typ == "drug"); diseases = sorted(n for n, typ in g["types"].items() if typ == "disease")
    known_all, known_train = positives(triples), positives(split["train"])
    encoder, predictor = GraphSAGEEncoder(g["x"].shape[1], 64, 64), LinkPredictor(64)
    optimizer = torch.optim.Adam(list(encoder.parameters()) + list(predictor.parameters()), lr=.01, weight_decay=1e-5)
    train_pairs = list(known_train); rng = random.Random(seed)
    for epoch in range(epochs):
        negatives = sample_negatives(drugs, diseases, known_all, len(train_pairs) * negative_ratio, random.Random(seed + epoch))
        to_idx = lambda ps: torch.tensor([[g["index"][a], g["index"][b]] for a, b in ps], dtype=torch.long)
        pos, neg = to_idx(train_pairs), to_idx(negatives); optimizer.zero_grad(); z = encoder(g["x"], g["edge_index"])
        loss = F.binary_cross_entropy_with_logits(predictor(z[pos[:,0]], z[pos[:,1]]), torch.ones(len(pos))) + F.binary_cross_entropy_with_logits(predictor(z[neg[:,0]], z[neg[:,1]]), torch.zeros(len(neg)))
        loss.backward(); optimizer.step()
    encoder.eval(); predictor.eval(); z = encoder(g["x"], g["edge_index"])
    ranks, cases = [], []
    for edge in split["test"]:
        drug, disease = edge["source"], edge["target"]
        if drug not in g["index"] or disease not in g["index"]: continue
        # Filter known positives other than the held-out target, but retain unobserved candidates.
        candidates = [d for d in drugs if (d, disease) not in known_all or d == drug]
        scores = [(d, float(predictor(z[g["index"][d]].unsqueeze(0), z[g["index"][disease]].unsqueeze(0)).item())) for d in candidates]
        scores.sort(key=lambda item: item[1], reverse=True); rank = [d for d, _ in scores].index(drug) + 1; ranks.append(rank)
        cases.append({"drug": drug, "disease": disease, "trueRank": rank, "candidateSetSize": len(candidates), "reciprocalRank": 1 / rank})
    popularity = {drug: sum(d == drug for d, _ in known_train) for drug in drugs}
    baseline_ranks = []
    for case in cases:
        candidates = [d for d in drugs if (d, case["disease"]) not in known_all or d == case["drug"]]
        ordered = sorted(candidates, key=lambda d: (-popularity[d], d)); baseline_ranks.append(ordered.index(case["drug"]) + 1)
    random_ranks = []
    for case in cases:
        candidates = [d for d in drugs if (d, case["disease"]) not in known_all or d == case["drug"]]; ordered = candidates.copy(); rng.shuffle(ordered); random_ranks.append(ordered.index(case["drug"]) + 1)
    return {"seed": seed, "split": {k: len(v) for k,v in split.items()}, "sampledNegativesPerEpoch": len(train_pairs)*negative_ratio,
            "gnn": ranking_metrics(ranks), "popularity": ranking_metrics(baseline_ranks), "random": ranking_metrics(random_ranks), "cases": cases}


def run(dataset: Path, output_root: Path, seeds: List[int], epochs: int, negative_ratio: int) -> Path:
    triples = json.loads(dataset.read_text()) if dataset.suffix == ".json" else []
    if not triples: raise ValueError("Runner currently requires the preserved JSON triple artifact")
    fingerprint = hashlib.sha256(dataset.read_bytes()).hexdigest(); runs = [evaluate_seed(triples, seed, epochs, negative_ratio) for seed in seeds]
    aggregate = {name: {metric: {"mean": mean([r[name][metric] for r in runs]), "std": pstdev([r[name][metric] for r in runs])} for metric in runs[0][name]} for name in ("gnn", "popularity", "random")}
    out = output_root / f"leakage_safe_v1_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"; out.mkdir(parents=True)
    (out / "results.json").write_text(json.dumps({"protocol": "leakage_safe_edge_split_v1", "datasetFingerprint": fingerprint, "seeds": seeds, "epochs": epochs, "negativeRatio": negative_ratio, "runs": runs, "aggregate": aggregate}, indent=2))
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--dataset", type=Path, required=True); parser.add_argument("--output-dir", type=Path, required=True); parser.add_argument("--seeds", nargs="+", type=int, default=[42, 43, 44]); parser.add_argument("--epochs", type=int, default=40); parser.add_argument("--negative-ratio", type=int, default=1)
    args = parser.parse_args(); print(run(args.dataset, args.output_dir, args.seeds, args.epochs, args.negative_ratio))
