from app.services.gnn.leakage_safe_evaluate import ranking_metrics, sample_negatives, split_edges, run


def rows():
    return [
        {"source": f"Drug{i}", "source_type": "drug", "relation": "treats", "target": f"Disease{i}", "target_type": "disease"}
        for i in range(6)
    ] + [{"source": f"Drug{i}", "source_type": "drug", "relation": "targets", "target": "Target0", "target_type": "target"} for i in range(6)] + [{"source": "Pathway0", "source_type": "pathway", "relation": "associated_with", "target": f"Disease{i}", "target_type": "disease"} for i in range(6)]


def test_held_out_target_edges_are_absent_from_training_graph_and_reproducible():
    first, second = split_edges(rows(), 42), split_edges(rows(), 42)
    assert [(x["source"], x["target"]) for x in first["test"]] == [(x["source"], x["target"]) for x in second["test"]]
    held = {(x["source"], x["target"]) for x in first["validation"] + first["test"]}
    assert not any((x["source"], x["target"]) in held for x in first["train"] if x["relation"] == "treats")


def test_sampled_negatives_are_not_known_positives():
    known = {("Drug0", "Disease0")}
    negatives = sample_negatives(["Drug0", "Drug1"], ["Disease0", "Disease1"], known, 10, __import__('random').Random(7))
    assert all(pair not in known for pair in negatives)


def test_ranking_metrics_on_small_example():
    metrics = ranking_metrics([1, 2, 4])
    assert metrics["mrr"] == (1 + .5 + .25) / 3
    assert metrics["hits_at_1"] == 1 / 3
    assert metrics["hits_at_5"] == 1


def test_experiment_metadata_is_saved(tmp_path):
    dataset = tmp_path / "triples.json"; dataset.write_text(__import__('json').dumps(rows()))
    output = run(dataset, tmp_path / "output", [7], epochs=1, negative_ratio=1)
    result = __import__('json').loads((output / "results.json").read_text())
    assert result["protocol"] == "leakage_safe_edge_split_v1"
    assert result["seeds"] == [7]
    assert result["datasetFingerprint"]
