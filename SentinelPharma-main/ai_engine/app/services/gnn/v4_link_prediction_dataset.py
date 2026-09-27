"""Leakage-safe experimental dataset utilities for biomedical_graph_v4."""
from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ENTITY_TYPES = ("DRUG", "DISEASE", "TARGET", "PATHWAY")
RELATION_TYPES = ("DRUG_INDICATION", "DRUG_TARGET", "DISEASE_TARGET", "TARGET_PATHWAY")
SUPERVISED = "DRUG_INDICATION"
PAIR_STATES = {"KNOWN_POSITIVE", "UNOBSERVED_CANDIDATE", "TRAINING_NEGATIVE_SAMPLE"}


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def pair_hash(pairs: Iterable[tuple[str, str]]) -> str:
    return stable_hash(sorted(set(pairs)))


@dataclass(frozen=True)
class Split:
    strategy: str
    seed: int
    train: tuple[tuple[str, str], ...]
    validation: tuple[tuple[str, str], ...]
    test: tuple[tuple[str, str], ...]
    excluded: tuple[tuple[str, str], ...] = ()

    def manifest(self) -> dict[str, Any]:
        return {"strategy": self.strategy, "seed": self.seed, "train": {"count": len(self.train), "hash": pair_hash(self.train)}, "validation": {"count": len(self.validation), "hash": pair_hash(self.validation)}, "test": {"count": len(self.test), "hash": pair_hash(self.test)}, "excluded": {"count": len(self.excluded), "hash": pair_hash(self.excluded)}}


class V4LinkPredictionDataset:
    def __init__(self, graph: dict[str, Any], graph_path: Path):
        self.graph, self.graph_path = graph, Path(graph_path)
        self.nodes = {item["canonicalId"]: item["entityType"] for item in graph["entities"]}
        self.relations = tuple({"source": item["source"], "target": item["target"], "relationType": item["relationType"], "provenance": item.get("provenance", [])} for item in graph["relations"])
        self.positives = tuple(sorted({(item["source"], item["target"]) for item in self.relations if item["relationType"] == SUPERVISED}))
        self.positive_set = set(self.positives)
        self.drugs = tuple(sorted(node for node, typ in self.nodes.items() if typ == "DRUG"))
        self.diseases = tuple(sorted(node for node, typ in self.nodes.items() if typ == "DISEASE"))

    @classmethod
    def load(cls, graph_path: Path, expected_hash: str | None = None) -> "V4LinkPredictionDataset":
        payload = json.loads(Path(graph_path).read_text(encoding="utf-8"))
        if payload.get("datasetVersion") not in {"biomedical_graph_v4", "biomedical_graph_v5"}: raise ValueError("Expected biomedical_graph_v4 or biomedical_graph_v5")
        if expected_hash is not None and payload.get("datasetHash") != expected_hash: raise ValueError("Graph datasetHash mismatch")
        entities, relations = payload.get("entities"), payload.get("relations")
        if not isinstance(entities, list) or not isinstance(relations, list): raise ValueError("Malformed v4 graph")
        node_types: dict[str, str] = {}
        for item in entities:
            identifier, typ = item.get("canonicalId"), item.get("entityType")
            if not isinstance(identifier, str) or typ not in ENTITY_TYPES or identifier in node_types: raise ValueError("Malformed or duplicate v4 entity")
            # V4 retains source-backed CHEMBL_TARGET entities in the complete
            # registry.  They are isolated because raw ChEMBL DRUG_TARGET
            # relations are excluded, but they remain valid V4 target IDs.
            prefixes = {
                "DRUG": ("CHEMBL:",),
                "TARGET": ("ENSEMBL:", "CHEMBL_TARGET:"),
                "PATHWAY": ("REACTOME:",),
            }
            if typ in prefixes and not identifier.startswith(prefixes[typ]): raise ValueError("Noncanonical v4 entity identifier")
            node_types[identifier] = typ
        if set(node_types.values()) != set(ENTITY_TYPES): raise ValueError("Missing required v4 entity type")
        seen = set()
        for item in relations:
            source, target, relation = item.get("source"), item.get("target"), item.get("relationType")
            if source not in node_types or target not in node_types or relation not in RELATION_TYPES: raise ValueError("Malformed v4 relation")
            edge = (source, target, relation)
            if edge in seen: raise ValueError("Duplicate v4 relation")
            seen.add(edge)
        if {item["relationType"] for item in relations} != set(RELATION_TYPES): raise ValueError("Missing required v4 relation type")
        return cls(payload, Path(graph_path))

    def pair_state(self, pair: tuple[str, str], training_negative_samples: Iterable[tuple[str, str]] = ()) -> str:
        if pair in self.positive_set: return "KNOWN_POSITIVE"
        if pair in set(training_negative_samples): return "TRAINING_NEGATIVE_SAMPLE"
        if pair[0] in self.drugs and pair[1] in self.diseases: return "UNOBSERVED_CANDIDATE"
        raise ValueError("Pair is outside the drug-disease candidate universe")

    def split(self, strategy: str, seed: int, validation_ratio: float = .15, test_ratio: float = .15) -> Split:
        if strategy == "per_drug_stratified": return self._per_drug_split(seed)
        if strategy == "random_edge": return self._random_split(seed, validation_ratio, test_ratio)
        if strategy == "cold_drug": return self._cold_split(seed, by="drug", validation_ratio=validation_ratio, test_ratio=test_ratio)
        if strategy == "cold_disease": return self._cold_split(seed, by="disease", validation_ratio=validation_ratio, test_ratio=test_ratio)
        raise ValueError(f"Unsupported split strategy: {strategy}")

    def _per_drug_split(self, seed: int) -> Split:
        rng, grouped = random.Random(seed), {}
        for pair in self.positives: grouped.setdefault(pair[0], []).append(pair)
        train, validation, test, excluded = [], [], [], []
        for drug in sorted(grouped):
            pairs = sorted(grouped[drug]); rng.shuffle(pairs)
            if len(pairs) < 3:
                train.extend(pairs); excluded.extend(pairs); continue
            test.append(pairs[0]); validation.append(pairs[1]); train.extend(pairs[2:])
        return Split("per_drug_stratified", seed, tuple(sorted(train)), tuple(sorted(validation)), tuple(sorted(test)), tuple(sorted(excluded)))

    def _random_split(self, seed: int, validation_ratio: float, test_ratio: float) -> Split:
        pairs = list(self.positives); random.Random(seed).shuffle(pairs)
        test_n, validation_n = max(1, round(len(pairs) * test_ratio)), max(1, round(len(pairs) * validation_ratio))
        return Split("random_edge", seed, tuple(sorted(pairs[test_n + validation_n:])), tuple(sorted(pairs[test_n:test_n + validation_n])), tuple(sorted(pairs[:test_n])))

    def _cold_split(self, seed: int, by: str, validation_ratio: float, test_ratio: float) -> Split:
        index = 0 if by == "drug" else 1
        groups = sorted({pair[index] for pair in self.positives}); random.Random(seed).shuffle(groups)
        test_n, validation_n = max(1, round(len(groups) * test_ratio)), max(1, round(len(groups) * validation_ratio))
        test_groups, validation_groups = set(groups[:test_n]), set(groups[test_n:test_n + validation_n])
        train, validation, test = [], [], []
        for pair in self.positives:
            (test if pair[index] in test_groups else validation if pair[index] in validation_groups else train).append(pair)
        return Split(f"cold_{by}", seed, tuple(sorted(train)), tuple(sorted(validation)), tuple(sorted(test)))

    def masked_relations(self, split: Split) -> tuple[dict[str, Any], ...]:
        held = set(split.validation) | set(split.test)
        masked = tuple(item for item in self.relations if not (item["relationType"] == SUPERVISED and (item["source"], item["target"]) in held))
        if any(item["relationType"] == SUPERVISED and (item["source"], item["target"]) in held for item in masked): raise AssertionError("Held indication edge leaked into message graph")
        return masked

    def sample_negatives(self, split: Split, ratio: int = 1, sampler: str = "uniform", seed: int = 42) -> tuple[tuple[str, str], ...]:
        if ratio < 1: raise ValueError("Negative ratio must be positive")
        requested = len(split.train) * ratio
        universe = [(drug, disease) for drug in self.drugs for disease in self.diseases if (drug, disease) not in self.positive_set]
        if requested > len(universe): raise ValueError("Insufficient unobserved candidates for unique negative sampling")
        rng = random.Random(seed)
        if sampler == "uniform": selected = rng.sample(universe, requested)
        elif sampler == "degree_matched":
            degree = {disease: sum(pair[1] == disease for pair in split.train) for disease in self.diseases}; available = set(universe); selected = []
            for drug, disease in sorted(split.train) * ratio:
                candidates = [pair for pair in available if pair[0] == drug]
                best = min(abs(degree[pair[1]] - degree[disease]) for pair in candidates)
                choices = sorted(pair for pair in candidates if abs(degree[pair[1]] - degree[disease]) == best)
                choice = choices[rng.randrange(len(choices))]; selected.append(choice); available.remove(choice)
        else: raise ValueError("Unsupported negative sampler")
        if set(selected) & self.positive_set: raise AssertionError("Known positive sampled as training negative")
        return tuple(sorted(selected))

    def filtered_diseases(self, drug: str, held_disease: str) -> tuple[str, ...]:
        return tuple(disease for disease in self.diseases if (drug, disease) not in self.positive_set or disease == held_disease)

    def structural_path_score(self, masked_relations: Iterable[dict[str, Any]], drug: str, disease: str) -> int:
        relations = tuple(masked_relations)
        targets = {item["target"] for item in relations if item["relationType"] == "DRUG_TARGET" and item["source"] == drug}
        disease_targets = {item["source"] for item in relations if item["relationType"] == "DISEASE_TARGET" and item["target"] == disease}
        return len(targets & disease_targets)

    def popularity_score(self, train_pairs: Iterable[tuple[str, str]], disease: str) -> int:
        return sum(pair[1] == disease for pair in train_pairs)
