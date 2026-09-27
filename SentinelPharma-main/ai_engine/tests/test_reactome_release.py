import hashlib
import json
from pathlib import Path

import pytest

from app.services.gnn.reactome_release import (
    MANIFEST_FILE,
    RECORD_FILE,
    RECORD_COLUMNS,
    SOURCE_URL,
    TARGET_FILE,
    ReactomeArtifactError,
    acquire_release_97,
    load_frozen_reactome,
)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _artifact(tmp_path: Path, *, release="97", record_text=None) -> Path:
    target = tmp_path / TARGET_FILE
    target.write_text("ENSG000001\n", encoding="utf-8")
    record = tmp_path / RECORD_FILE
    record.write_text(record_text or "\t".join(RECORD_COLUMNS) + "\nENSG000001\tR-HSA-1\thttps://reactome.org/PathwayBrowser/#/R-HSA-1\tPathway\tTAS\tHomo sapiens\n", encoding="utf-8")
    manifest = {
        "source": "Reactome", "release": release, "retrievedAt": "2026-09-21T00:00:00+00:00",
        "authoritativeSourceUrl": SOURCE_URL, "acquisitionMethod": "test",
        "targetSelection": {"inputTargetListSha256": _sha(target), "selectedTargetCount": 1, "orderedEnsemblIds": ["ENSG000001"]},
        "files": [{"name": RECORD_FILE, "sha256": _sha(record), "recordCount": 1}],
        "recordCounts": {"inputTargetIds": 1, "uniqueInputTargetIds": 1, "matchedTargetIds": 1, "unmatchedTargetIds": 0, "pathwayMappings": 1},
    }
    (tmp_path / MANIFEST_FILE).write_text(json.dumps(manifest), encoding="utf-8")
    return tmp_path


def test_valid_frozen_artifact_loads_without_network(tmp_path, monkeypatch):
    source = _artifact(tmp_path)
    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("network")))
    records, manifest = load_frozen_reactome(source)
    assert manifest["release"] == "97"
    assert records == [{"ensemblGeneId": "ENSG000001", "pathwayStableId": "R-HSA-1", "pathwayUrl": "https://reactome.org/PathwayBrowser/#/R-HSA-1", "pathwayName": "Pathway", "evidenceCode": "TAS", "species": "Homo sapiens"}]


def test_missing_manifest_fails(tmp_path):
    with pytest.raises(ReactomeArtifactError, match="manifest missing"):
        load_frozen_reactome(tmp_path)


def test_wrong_release_fails(tmp_path):
    with pytest.raises(ReactomeArtifactError, match="release mismatch"):
        load_frozen_reactome(_artifact(tmp_path, release="96"))


def test_missing_data_file_fails(tmp_path):
    source = _artifact(tmp_path)
    (source / RECORD_FILE).unlink()
    with pytest.raises(ReactomeArtifactError, match="record file missing"):
        load_frozen_reactome(source)


def test_sha256_mismatch_fails(tmp_path):
    source = _artifact(tmp_path)
    (source / RECORD_FILE).write_text("changed", encoding="utf-8")
    with pytest.raises(ReactomeArtifactError, match="SHA256 mismatch"):
        load_frozen_reactome(source)


def test_malformed_records_fail(tmp_path):
    bad = "\t".join(RECORD_COLUMNS) + "\nENSG000001\tR-MMU-1\turl\tPathway\tTAS\tMus musculus\n"
    with pytest.raises(ReactomeArtifactError, match="human Reactome pathway ID"):
        load_frozen_reactome(_artifact(tmp_path, record_text=bad))


def test_acquisition_filters_and_writes_manifest(tmp_path):
    targets = tmp_path / "targets.txt"
    targets.write_text("ENSG000001\nENSG000002\n", encoding="utf-8")
    payload = b"ENSG000001\tR-HSA-1\turl\tPathway\tTAS\tHomo sapiens\nENSG000002\tR-MMU-2\turl\tMouse\tTAS\tMus musculus\n"

    class Response:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def __iter__(self): return iter(payload.splitlines(keepends=True))

    manifest = acquire_release_97(targets, tmp_path / "artifact", opener=lambda url: Response(), retrieved_at="2026-09-21T00:00:00+00:00")
    assert manifest["recordCounts"] == {"inputTargetIds": 2, "uniqueInputTargetIds": 2, "matchedTargetIds": 1, "unmatchedTargetIds": 1, "pathwayMappings": 1}
    records, _ = load_frozen_reactome(tmp_path / "artifact")
    assert [record["pathwayStableId"] for record in records] == ["R-HSA-1"]
