"""Automated integrity and source-recomputed verification tests for SentinelPharma V6 Biomedical Graph."""
import hashlib
import json
from pathlib import Path
import pytest

FROZEN_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "biomedical_graph" / "v6_production" / "biomedical_graph_v6_frozen"
GRAPH_PATH = FROZEN_DIR / "graph.json"
QUALITY_PATH = FROZEN_DIR / "quality_report.json"
SUPERVISION_PATH = FROZEN_DIR / "supervision_indications.json"
AMBIGUOUS_PATH = FROZEN_DIR / "ambiguous_mappings.json"
MANIFEST_PATH = FROZEN_DIR / "source_manifest.json"


@pytest.fixture(scope="module")
def graph_data():
    assert GRAPH_PATH.exists(), f"Frozen graph.json missing at {GRAPH_PATH}"
    with open(GRAPH_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def quality_data():
    assert QUALITY_PATH.exists(), f"Frozen quality_report.json missing at {QUALITY_PATH}"
    with open(QUALITY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def supervision_data():
    assert SUPERVISION_PATH.exists(), f"Frozen supervision_indications.json missing at {SUPERVISION_PATH}"
    with open(SUPERVISION_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def ambiguous_data():
    assert AMBIGUOUS_PATH.exists(), f"Frozen ambiguous_mappings.json missing at {AMBIGUOUS_PATH}"
    with open(AMBIGUOUS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def manifest_data():
    assert MANIFEST_PATH.exists(), f"Frozen source_manifest.json missing at {MANIFEST_PATH}"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_frozen_artifacts_exist_and_valid_schema(graph_data, quality_data, supervision_data, ambiguous_data, manifest_data):
    """Verifies that all 5 required V6 frozen artifacts exist and have valid headers."""
    assert graph_data["datasetVersion"] == "biomedical_graph_v6"
    assert "datasetHash" in graph_data
    assert len(graph_data["datasetHash"]) == 64
    assert len(graph_data["entities"]) > 0
    assert len(graph_data["relations"]) > 0

    assert quality_data["datasetHash"] == graph_data["datasetHash"]
    assert supervision_data["datasetHash"] == graph_data["datasetHash"]
    assert manifest_data["datasetHash"] == graph_data["datasetHash"]

    # Manifest lineage
    sources = manifest_data["sources"]
    assert sources["chembl"]["release"] == "36"
    assert sources["openTargets"]["release"] == "26.06"
    assert sources["reactome"]["release"] == "97"
    assert sources["crosswalk"]["version"] == "v6-bulk-clinical"


def test_strict_no_indication_leakage_in_message_passing(graph_data):
    """Enforces zero DRUG_INDICATION edges in graph.json relations to prevent message-passing data leakage."""
    allowed_relations = {
        "DRUG_TARGET_CURATED_MECHANISM",
        "DRUG_TARGET_BIOACTIVITY",
        "DISEASE_TARGET",
        "TARGET_PATHWAY",
    }
    for r in graph_data["relations"]:
        assert r["relationType"] != "DRUG_INDICATION", "LEAKAGE: DRUG_INDICATION found in message-passing graph!"
        assert r["relationType"] in allowed_relations, f"Unexpected relationType: {r['relationType']}"


def test_supervision_indications_isolated_and_endpoint_verified(graph_data, supervision_data):
    """Verifies that supervision indications are stored separately and connect valid graph entities."""
    entity_ids = {e["canonicalId"] for e in graph_data["entities"]}
    indications = supervision_data["indications"]
    assert len(indications) > 0
    assert supervision_data["totalPairs"] == len(indications)

    for item in indications:
        assert item["drug"].startswith("CHEMBL:")
        assert item["disease"].startswith("EFO:") or item["disease"].startswith("MONDO:") or item["disease"].startswith("DOID:") or item["disease"].startswith("Orphanet:") or item["disease"].startswith("HP:") or item["disease"].startswith("OTAR:")
        assert item["drug"] in entity_ids, f"Indication drug {item['drug']} not in entity graph"
        assert item["disease"] in entity_ids, f"Indication disease {item['disease']} not in entity graph"
        assert item["evidenceLevel"] == "CURATED_INDICATION"


def test_ambiguous_mappings_strictly_excluded(graph_data, ambiguous_data):
    """Verifies that ambiguous 1:many loci targets are strictly excluded from message-passing graph edges."""
    ambiguous_tids = set(ambiguous_data["ambiguousTargets"].keys())
    assert len(ambiguous_tids) > 0

    # Ensure no relation provenance contains an ambiguous ChEMBL target
    for r in graph_data["relations"]:
        for prov in r.get("provenance", []):
            if "sourceRecordId" in prov and prov["sourceRecordId"] in ambiguous_tids:
                pytest.fail(f"Ambiguous target {prov['sourceRecordId']} leaked into relation {r}")


def test_disease_target_threshold_and_min_gene_invariants(graph_data):
    """Verifies Open Targets score >= 0.3 and >= 3 distinct trusted genes per disease invariant."""
    disease_genes = {}
    for r in graph_data["relations"]:
        if r["relationType"] == "DISEASE_TARGET":
            d = r["source"]
            g = r["target"]
            disease_genes.setdefault(d, set()).add(g)
            # Check score
            score = r["provenance"][0]["metadata"]["associationScore"]
            assert score >= 0.3, f"Disease-target score {score} < 0.3 for edge ({d}, {g})"

    for d, genes in disease_genes.items():
        assert len(genes) >= 3, f"Disease {d} has fewer than 3 connected genes: {len(genes)}"


def test_curated_mechanism_and_bioactivity_disjointness(graph_data):
    """Verifies that DRUG_TARGET_CURATED_MECHANISM and DRUG_TARGET_BIOACTIVITY edges are strictly disjoint."""
    curated_edges = set()
    bioactivity_edges = set()

    for r in graph_data["relations"]:
        pair = (r["source"], r["target"])
        if r["relationType"] == "DRUG_TARGET_CURATED_MECHANISM":
            curated_edges.add(pair)
        elif r["relationType"] == "DRUG_TARGET_BIOACTIVITY":
            bioactivity_edges.add(pair)

    overlap = curated_edges.intersection(bioactivity_edges)
    assert len(overlap) == 0, f"Found {len(overlap)} overlapping edges between curated mechanisms and bioactivity: {list(overlap)[:5]}"


def test_dataset_hash_determinism_and_recomputability(graph_data):
    """Recomputes SHA-256 hash over canonically sorted entities and relations, confirming exact determinism."""
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != "retrievedAt"}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    payload = json.dumps(clean({"entities": graph_data["entities"], "relations": graph_data["relations"]}), sort_keys=True).encode("utf-8")
    recomputed_hash = hashlib.sha256(payload).hexdigest()

    assert recomputed_hash == graph_data["datasetHash"], "Recomputed datasetHash does not match recorded graph.json datasetHash"


def test_node_edge_census_and_connectivity(quality_data):
    """Validates node counts, edge counts, and isolated entities in quality report."""
    ent_counts = quality_data["entitiesByType"]
    assert ent_counts["DRUG"] >= 6000, f"Expected >= 6,000 drugs, got {ent_counts['DRUG']}"
    assert ent_counts["TARGET"] >= 2400, f"Expected >= 2,400 targets, got {ent_counts['TARGET']}"
    assert ent_counts["DISEASE"] >= 2600, f"Expected >= 2,600 diseases, got {ent_counts['DISEASE']}"
    assert ent_counts["PATHWAY"] >= 1800, f"Expected >= 1,800 pathways, got {ent_counts['PATHWAY']}"

    rel_counts = quality_data["relationsByType"]
    assert rel_counts["DISEASE_TARGET"] >= 65000, f"Expected >= 65,000 disease-target edges, got {rel_counts['DISEASE_TARGET']}"
    assert rel_counts["DRUG_TARGET_CURATED_MECHANISM"] >= 10000, f"Expected >= 10,000 curated mechanism edges, got {rel_counts['DRUG_TARGET_CURATED_MECHANISM']}"
    assert rel_counts["DRUG_TARGET_BIOACTIVITY"] >= 15000, f"Expected >= 15,000 bioactivity edges, got {rel_counts['DRUG_TARGET_BIOACTIVITY']}"
    assert rel_counts["TARGET_PATHWAY"] >= 15000, f"Expected >= 15,000 pathway edges, got {rel_counts['TARGET_PATHWAY']}"

    # Disconnected entities
    assert quality_data["isolatedEntitiesCount"] == 0, f"Found {quality_data['isolatedEntitiesCount']} disconnected entities!"
