import json
import hashlib
from pathlib import Path

from app.services.gnn.v4_leakage_safe_evaluate import run_smoke

GRAPH = Path(__file__).parents[1] / "artifacts/biomedical_graph/phase2gc_frozen_full/biomedical_graph_v4_20260921T080028Z/graph.json"
HASH = "6787bd1bb0996f2f0becf3ce1be4a7ad297772f9d3c669cd33158c02c81fecb4"

def test_smoke_manifest_references_exact_v4_and_prediction_label(tmp_path):
    output = run_smoke(GRAPH, tmp_path / "run", HASH, seeds=(42,), epochs=1)
    manifest = json.loads((output / "experiment_manifest.json").read_text())
    metrics = json.loads((output / "metrics.json").read_text())
    assert manifest["graph"]["datasetHash"] == HASH
    assert manifest["split"]["test"]["hash"]
    assert metrics["perSeed"][0]["predictionProvenanceLabel"] == "MODEL_PREDICTION"
    assert (output / "checkpoint_seed_42.pt").exists()


def test_production_repurposing_service_is_unchanged():
    production = Path(__file__).parents[1] / "app/services/gnn/repurposing_gnn_service.py"
    # Baseline includes the approved fail-closed structure-provenance policy;
    # model scoring and candidate ordering remain unchanged.
    assert hashlib.sha256(production.read_bytes()).hexdigest() == "d0673ed0dc520e944df851dc4d48b6692ffa678a15d3492f99fbbc638262df5d"
