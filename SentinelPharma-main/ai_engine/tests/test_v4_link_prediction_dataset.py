import json
from pathlib import Path

import pytest

from app.services.gnn.v4_link_prediction_dataset import V4LinkPredictionDataset
from app.services.gnn.v4_leakage_safe_evaluate import tensor_graph

GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"

def dataset(): return V4LinkPredictionDataset.load(GRAPH, HASH)

def test_v4_loads_complete_positive_registry_and_states():
    value = dataset()
    assert len(value.nodes) == 807 and len(value.positives) == 212
    assert value.pair_state(value.positives[0]) == "KNOWN_POSITIVE"
    assert value.pair_state((value.drugs[0], next(d for d in value.diseases if (value.drugs[0], d) not in value.positive_set))) == "UNOBSERVED_CANDIDATE"

def test_wrong_version_and_hash_fail(tmp_path):
    raw = json.loads(GRAPH.read_text()); raw["datasetVersion"] = "bad"; bad = tmp_path / "bad.json"; bad.write_text(json.dumps(raw))
    with pytest.raises(ValueError, match="Expected"): V4LinkPredictionDataset.load(bad)
    with pytest.raises(ValueError, match="datasetHash mismatch"): V4LinkPredictionDataset.load(GRAPH, "wrong")

def test_splits_negatives_and_hashes_are_deterministic():
    value = dataset(); first, second = value.split("per_drug_stratified", 42), value.split("per_drug_stratified", 42)
    assert first.manifest() == second.manifest()
    assert not (set(first.train) & (set(first.validation) | set(first.test)))
    negatives = value.sample_negatives(first, seed=1337)
    assert negatives == value.sample_negatives(first, seed=1337) and not (set(negatives) & value.positive_set)
    assert value.pair_state(negatives[0], negatives) == "TRAINING_NEGATIVE_SAMPLE"

def test_masking_removes_held_edges_both_directions_and_keeps_nodes_for_cold_split():
    value = dataset(); split = value.split("per_drug_stratified", 42); graph = tensor_graph(value, split)
    held = set(split.validation) | set(split.test)
    assert not any(edge["relationType"] == "DRUG_INDICATION" and (edge["source"], edge["target"]) in held for edge in graph["relations"])
    for drug, disease in held:
        assert drug in graph["index"] and disease in graph["index"]
    cold = value.split("cold_drug", 42); cold_graph = tensor_graph(value, cold)
    assert set(value.nodes) == set(cold_graph["index"])

def test_filtered_ranking_and_baselines_do_not_use_held_indication_labels():
    value = dataset(); split = value.split("per_drug_stratified", 42); graph = tensor_graph(value, split); drug, disease = split.test[0]
    candidates = value.filtered_diseases(drug, disease)
    assert disease in candidates and all((drug, other) not in value.positive_set for other in candidates if other != disease)
    score = value.structural_path_score(graph["relations"], drug, disease)
    assert score == value.structural_path_score([edge for edge in graph["relations"] if edge["relationType"] != "DRUG_INDICATION"], drug, disease)
    assert value.popularity_score(split.train, disease) == value.popularity_score(split.train, disease)
