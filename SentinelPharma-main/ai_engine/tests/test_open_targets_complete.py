import hashlib
import json

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.services.gnn.open_targets_release import read_complete_direct_associations


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _snapshot(tmp_path, *, ambiguous=False):
    root = tmp_path / "open_targets"
    data = root / "output" / "association_overall_direct"
    data.mkdir(parents=True)
    disease = pa.table({"id": ["EFO_1", "MONDO_1"] + (["MONDO_2"] if ambiguous else []), "name": ["exact", "replacement"] + (["other"] if ambiguous else []), "obsoleteTerms": [[], ["EFO_2"]] + ([["EFO_2"]] if ambiguous else [])})
    pq.write_table(disease, root / "disease.parquet")
    table = pa.table({"diseaseId": ["EFO_1", "MONDO_1"], "targetId": ["ENSG00000000001", "ENSG00000000002"], "associationScore": [.3, .8], "evidenceCount": [1, 2], "aggregationType": ["overall_direct", "overall_direct"]})
    part = data / "part-00000.parquet"; pq.write_table(table, part)
    manifest = {"source": "Open Targets Platform", "release": "26.06", "dataset": "association_overall_direct", "complete": True, "partitionCount": 1, "partitions": [{"filename": part.name, "sourceUrl": "https://example.test/part-00000.parquet", "bytes": part.stat().st_size, "sha256": _sha(part), "rowCount": 2}]}
    (root / "open_targets_complete_direct_manifest.json").write_text(json.dumps(manifest))
    return root, part


def test_complete_reader_uses_manifest_hashes_and_explicit_obsolete_mapping(tmp_path, monkeypatch):
    root, _ = _snapshot(tmp_path)
    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network")))
    rows, mappings, manifest = read_complete_direct_associations(root, ["EFO:1", "EFO:2"])
    assert manifest["partitionCount"] == 1
    assert [(row["originalDiseaseId"], row["mappingStatus"]) for row in rows] == [("EFO:1", "EXACT"), ("EFO:2", "EXACT_OBSOLETE_TERM_MAPPING")]
    assert mappings["EFO:2"]["canonicalOpenTargetsDiseaseId"] == "MONDO_1"


def test_complete_reader_fails_closed_for_hash_or_ambiguous_obsolete_mapping(tmp_path):
    root, part = _snapshot(tmp_path)
    part.write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="integrity"):
        read_complete_direct_associations(root, ["EFO:1"])
    root, _ = _snapshot(tmp_path / "ambiguous", ambiguous=True)
    rows, mappings, _ = read_complete_direct_associations(root, ["EFO:2"])
    assert rows == [] and mappings == {}
