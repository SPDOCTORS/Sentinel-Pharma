"""Version-pinned, bounded Open Targets Platform Parquet reader.

This deliberately has no GraphQL fallback: callers either use the recorded
release snapshot or receive a clear failure.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.request import urlretrieve

RELEASE = "26.06"
BASE_URL = f"https://ftp.ebi.ac.uk/pub/databases/opentargets/platform/{RELEASE}/output"
DATASETS = {
    "disease": f"{BASE_URL}/disease/disease.parquet",
    "association_overall_direct_part_00000": f"{BASE_URL}/association_overall_direct/part-00000-c3eaa79c-fb08-4d4a-9391-a4eceb74fa7a-c000.snappy.parquet",
}
COMPLETE_DIRECT_MANIFEST = "open_targets_complete_direct_manifest.json"
DIRECT_DATASET = "association_overall_direct"
_ENSEMBL = re.compile(r"^ENSG\d{11}$")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_complete_direct_manifest(cache_dir: Path) -> dict:
    """Validate the explicit complete snapshot; never discover arbitrary files."""
    cache_dir = Path(cache_dir)
    path = cache_dir / COMPLETE_DIRECT_MANIFEST
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Complete Open Targets manifest missing or malformed: {path}") from exc
    if (manifest.get("source"), manifest.get("release"), manifest.get("dataset"), manifest.get("complete")) != ("Open Targets Platform", RELEASE, DIRECT_DATASET, True):
        raise ValueError("Unexpected complete Open Targets direct snapshot")
    partitions = manifest.get("partitions")
    if not isinstance(partitions, list) or not partitions:
        raise ValueError("Complete Open Targets manifest lacks partitions")
    names = [item.get("filename") for item in partitions]
    if names != sorted(names) or len(names) != len(set(names)):
        raise ValueError("Complete Open Targets partitions are not deterministically ordered")
    if manifest.get("partitionCount") != len(partitions):
        raise ValueError("Complete Open Targets partition count mismatch")
    return manifest


def _disease_mappings(cache_dir: Path, disease_ids: Iterable[str]) -> dict[str, dict]:
    """Return only exact or explicit, unambiguous obsolete-term mappings."""
    import pyarrow.parquet as pq
    source_ids = sorted(set(disease_ids))
    disease_path = Path(cache_dir) / "disease.parquet"
    if not disease_path.is_file():
        raise ValueError(f"Open Targets disease ontology missing: {disease_path}")
    records = pq.read_table(disease_path, columns=["id", "name", "obsoleteTerms"]).to_pylist()
    by_id = {record["id"]: record for record in records if record.get("id")}
    obsolete = {}
    for record in records:
        for term in record.get("obsoleteTerms") or []:
            obsolete.setdefault(term.replace("_", ":", 1), []).append(record)
    result = {}
    for original in source_ids:
        converted, status = chembl_to_open_targets_id(original)
        if converted and converted in by_id:
            result[original] = {"originalDiseaseId": original, "canonicalOpenTargetsDiseaseId": converted, "mappingStatus": "EXACT", "currentDiseaseName": by_id[converted].get("name")}
            continue
        # Phase 2O approved obsolete canonicalization only for the audited
        # missing EFO identifiers. Other namespaces remain unresolved here.
        matches = obsolete.get(original, []) if original.startswith("EFO:") else []
        if len(matches) == 1:
            result[original] = {"originalDiseaseId": original, "canonicalOpenTargetsDiseaseId": matches[0]["id"], "mappingStatus": "EXACT_OBSOLETE_TERM_MAPPING", "currentDiseaseName": matches[0].get("name")}
    return result


def read_complete_direct_associations(cache_dir: Path, disease_ids: Iterable[str], minimum_score: float = .3) -> tuple[list[dict], dict[str, dict], dict]:
    """Read only manifest-declared, hash-verified direct records offline."""
    import pyarrow.parquet as pq
    if minimum_score != .3:
        raise ValueError("Complete Open Targets reader requires the frozen direct threshold of 0.3")
    cache_dir = Path(cache_dir)
    manifest = load_complete_direct_manifest(cache_dir)
    mappings = _disease_mappings(cache_dir, disease_ids)
    by_canonical: dict[str, list[dict]] = {}
    for mapping in mappings.values():
        by_canonical.setdefault(mapping["canonicalOpenTargetsDiseaseId"], []).append(mapping)
    rows = []
    schema = None
    for entry in manifest["partitions"]:
        filename, expected = entry.get("filename"), entry.get("sha256")
        path = cache_dir / "output" / DIRECT_DATASET / str(filename)
        if not path.is_file() or path.stat().st_size != entry.get("bytes") or _sha256(path).lower() != str(expected).lower():
            raise ValueError(f"Complete Open Targets integrity validation failed: {path}")
        parquet = pq.ParquetFile(path)
        current_schema = str(parquet.schema_arrow)
        if schema is None: schema = current_schema
        elif schema != current_schema: raise ValueError("Complete Open Targets schema mismatch")
        required = {"diseaseId", "targetId", "associationScore", "evidenceCount", "aggregationType"}
        if not required.issubset(parquet.schema_arrow.names): raise ValueError("Unexpected complete Open Targets association schema")
        for batch in parquet.iter_batches(columns=sorted(required), batch_size=131072):
            for item in batch.to_pylist():
                if item["associationScore"] is None or item["associationScore"] < minimum_score or not _ENSEMBL.fullmatch(item.get("targetId") or ""):
                    continue
                for mapping in by_canonical.get(item["diseaseId"], []):
                    rows.append({**item, **mapping, "sourceFile": entry["sourceUrl"], "sourceRelease": RELEASE})
    rows.sort(key=lambda row: (row["originalDiseaseId"], row["targetId"], row["canonicalOpenTargetsDiseaseId"]))
    return rows, mappings, manifest

def chembl_to_open_targets_id(identifier: str) -> tuple[str | None, str]:
    """Return only an exact namespace-format conversion; never name-match."""
    if identifier.startswith(("EFO:", "MONDO:", "HP:")):
        return identifier.replace(":", "_", 1), "EXACT"
    return None, "UNRESOLVED"

def cache_required_datasets(cache_dir: Path) -> dict:
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, url in DATASETS.items():
        path = cache_dir / Path(url).name
        # Never treat an interrupted zero-byte transfer as a reproducible cache.
        if not path.exists() or path.stat().st_size == 0:
            temporary = path.with_suffix(path.suffix + ".partial")
            if temporary.exists(): temporary.unlink()
            urlretrieve(url, temporary)
            if temporary.stat().st_size == 0: raise ValueError(f"Empty Open Targets download: {url}")
            temporary.replace(path)
        paths[name] = str(path)
    manifest = {"source": "Open Targets Platform", "release": RELEASE, "retrievedAt": datetime.now(timezone.utc).isoformat(), "datasets": DATASETS, "localFiles": paths, "license": "CC0-1.0"}
    (cache_dir / "open_targets_source_manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest

def read_direct_associations(cache_dir: Path, disease_ids: Iterable[str], minimum_score: float = .3, maximum_rows: int = 5000):
    """Read only association columns from the cached development partition."""
    import pyarrow.parquet as pq
    wanted = {chembl_to_open_targets_id(x)[0] for x in disease_ids} - {None}
    path = cache_dir / Path(DATASETS["association_overall_direct_part_00000"]).name
    table = pq.read_table(path)
    columns = table.column_names
    # The Platform schema names are release-controlled; fail closed if changed.
    required = {"diseaseId", "targetId", "associationScore"}
    if not required.issubset(columns): raise ValueError(f"Unexpected Open Targets {RELEASE} association schema: {columns}")
    rows = []
    for item in table.select(["diseaseId", "targetId", "associationScore", "evidenceCount"]).to_pylist():
        if item["diseaseId"] in wanted and item["targetId"] and item["associationScore"] >= minimum_score:
            rows.append(item)
            if len(rows) >= maximum_rows: break
    return rows
