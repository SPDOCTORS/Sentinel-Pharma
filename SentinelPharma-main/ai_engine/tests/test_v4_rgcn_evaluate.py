import json
from pathlib import Path

import torch

from app.services.gnn.v4_link_prediction_dataset import V4LinkPredictionDataset
from app.services.gnn.v4_rgcn_evaluate import RELATION_ID_MAP, persisted_phase_2h_split, relation_tensor_graph, run_rgcn_baseline


GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"
PHASE_2H = Path(__file__).parents[1] / "artifacts/gnn/evaluations/v4_20260921T083016Z"


def test_relation_mapping_is_deterministic_and_structural_relations_remain_distinguishable():
    assert RELATION_ID_MAP == {
        "DRUG_INDICATION": 0, "DRUG_INDICATION__REVERSE": 1,
        "DRUG_TARGET": 2, "DRUG_TARGET__REVERSE": 3,
        "DISEASE_TARGET": 4, "DISEASE_TARGET__REVERSE": 5,
        "TARGET_PATHWAY": 6, "TARGET_PATHWAY__REVERSE": 7,
    }
    assert len(set(RELATION_ID_MAP.values())) == 8


def test_rgcn_tensor_masks_held_labels_before_reverse_edges_and_degree_features():
    dataset = V4LinkPredictionDataset.load(GRAPH, HASH)
    split, _ = persisted_phase_2h_split(dataset, PHASE_2H)
    graph = relation_tensor_graph(dataset, split)
    held = set(split.validation) | set(split.test)
    for drug, disease in held:
        assert (graph["index"][drug], graph["index"][disease], RELATION_ID_MAP["DRUG_INDICATION"]) not in graph["typedEdges"]
        assert (graph["index"][disease], graph["index"][drug], RELATION_ID_MAP["DRUG_INDICATION__REVERSE"]) not in graph["typedEdges"]
    assert graph["x"].shape[0] == len(dataset.nodes)
    degree = torch.bincount(graph["edge_index"][0], minlength=len(dataset.nodes)).float()
    assert torch.allclose(graph["x"][:, -1], degree / degree.max())


def test_rgcn_reuses_phase_2h_split_and_negative_policy(tmp_path):
    output = run_rgcn_baseline(GRAPH, tmp_path / "run", HASH, phase_2h_root=PHASE_2H, seeds=(42,), epochs=1)
    manifest = json.loads((output / "experiment_manifest.json").read_text())
    metrics = json.loads((output / "metrics.json").read_text())
    phase_2h = json.loads((PHASE_2H / "experiment_manifest.json").read_text())
    assert manifest["split"] == phase_2h["split"]
    assert manifest["negativeSampling"]["evaluationNegativeHash"] == phase_2h["negativeSampling"]["evaluationNegativeHash"]
    assert metrics["perSeed"][0]["predictionProvenanceLabel"] == "MODEL_PREDICTION"
    dataset = V4LinkPredictionDataset.load(GRAPH, HASH)
    split, _ = persisted_phase_2h_split(dataset, PHASE_2H)
    assert not (set(dataset.sample_negatives(split, seed=42)) & dataset.positive_set)
