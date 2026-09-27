"""Explicit Reactome release acquisition and offline frozen-artifact reader.

This module deliberately keeps acquisition separate from consumption.  Graph
builders must call ``load_frozen_reactome`` and therefore never download data.
"""
from __future__ import annotations

import csv
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen as _urlopen


RELEASE = "97"
SOURCE_URL = "https://download.reactome.org/97/Ensembl2Reactome.txt"
RECORD_FILE = "ensembl_to_pathways.tsv"
MANIFEST_FILE = "source_manifest.json"
TARGET_FILE = "input_ensembl_targets.txt"
RECORD_COLUMNS = (
    "ensemblGeneId",
    "pathwayStableId",
    "pathwayUrl",
    "pathwayName",
    "evidenceCode",
    "species",
)
_ENSEMBL_GENE = re.compile(r"^ENSG\d+$")
_PATHWAY = re.compile(r"^R-HSA-\d+$")


class ReactomeArtifactError(ValueError):
    """Raised when a Reactome frozen artifact is absent, corrupt, or invalid."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_target_id(value: str) -> str:
    value = value.strip()
    if not _ENSEMBL_GENE.fullmatch(value):
        raise ReactomeArtifactError(f"Malformed Ensembl gene ID: {value!r}")
    return value


def read_target_ids(path: Path) -> list[str]:
    """Read the ordered selection, retaining repeated entries if present."""
    path = Path(path)
    if not path.is_file():
        raise ReactomeArtifactError(f"Reactome input target list missing: {path}")
    values = [_validate_target_id(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not values:
        raise ReactomeArtifactError("Reactome input target list is empty")
    return values


def _validate_record(record: dict[str, str]) -> dict[str, str]:
    if tuple(record) != RECORD_COLUMNS:
        raise ReactomeArtifactError("Unexpected Reactome frozen-record columns")
    if any(record[key] is None for key in RECORD_COLUMNS):
        raise ReactomeArtifactError("Malformed Reactome frozen record")
    record = {key: record[key].strip() for key in RECORD_COLUMNS}
    _validate_target_id(record["ensemblGeneId"])
    if not _PATHWAY.fullmatch(record["pathwayStableId"]):
        raise ReactomeArtifactError(f"Malformed human Reactome pathway ID: {record['pathwayStableId']!r}")
    if not record["pathwayName"] or record["species"] != "Homo sapiens":
        raise ReactomeArtifactError("Frozen Reactome record is not a named Homo sapiens pathway")
    return record


def load_frozen_reactome(source_dir: Path, expected_release: str = RELEASE) -> tuple[list[dict[str, str]], dict[str, Any]]:
    """Validate and load a local artifact; this function has no network code."""
    source_dir = Path(source_dir)
    manifest_path = source_dir / MANIFEST_FILE
    records_path = source_dir / RECORD_FILE
    if not manifest_path.is_file():
        raise ReactomeArtifactError(f"Reactome source manifest missing: {manifest_path}")
    if not records_path.is_file():
        raise ReactomeArtifactError(f"Reactome frozen record file missing: {records_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ReactomeArtifactError(f"Malformed Reactome source manifest: {manifest_path}") from exc
    if not isinstance(manifest, dict) or manifest.get("source") != "Reactome":
        raise ReactomeArtifactError("Invalid Reactome source manifest")
    if manifest.get("release") != expected_release:
        raise ReactomeArtifactError(f"Reactome release mismatch: expected {expected_release}, found {manifest.get('release')!r}")
    if not all(isinstance(manifest.get(key), str) and manifest[key] for key in ("retrievedAt", "authoritativeSourceUrl", "acquisitionMethod")):
        raise ReactomeArtifactError("Reactome source manifest lacks acquisition provenance")
    files = manifest.get("files")
    if not isinstance(files, list):
        raise ReactomeArtifactError("Reactome manifest files section is missing")
    entry = next((item for item in files if isinstance(item, dict) and item.get("name") == RECORD_FILE), None)
    if not entry or not isinstance(entry.get("sha256"), str) or not isinstance(entry.get("recordCount"), int):
        raise ReactomeArtifactError("Reactome manifest lacks frozen-record integrity data")
    if sha256_file(records_path).lower() != entry["sha256"].lower():
        raise ReactomeArtifactError("Reactome frozen-record SHA256 mismatch")
    try:
        with records_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            if tuple(reader.fieldnames or ()) != RECORD_COLUMNS:
                raise ReactomeArtifactError("Unexpected Reactome frozen-record header")
            records = [_validate_record(row) for row in reader]
    except csv.Error as exc:
        raise ReactomeArtifactError("Malformed Reactome frozen-record TSV") from exc
    counts = manifest.get("recordCounts")
    if not isinstance(counts, dict) or any(not isinstance(counts.get(key), int) for key in ("inputTargetIds", "uniqueInputTargetIds", "matchedTargetIds", "unmatchedTargetIds", "pathwayMappings")):
        raise ReactomeArtifactError("Reactome source manifest lacks record counts")
    if len(records) != entry["recordCount"] or counts["pathwayMappings"] != len(records):
        raise ReactomeArtifactError("Reactome frozen-record count mismatch")
    if counts["uniqueInputTargetIds"] != counts["matchedTargetIds"] + counts["unmatchedTargetIds"]:
        raise ReactomeArtifactError("Reactome target match counts are inconsistent")
    target_path = source_dir / TARGET_FILE
    selection = manifest.get("targetSelection")
    target_sha = selection.get("inputTargetListSha256") if isinstance(selection, dict) else None
    if not target_path.is_file() or not isinstance(selection, dict) or not isinstance(target_sha, str):
        raise ReactomeArtifactError("Reactome target-selection provenance is missing")
    if sha256_file(target_path).lower() != target_sha.lower():
        raise ReactomeArtifactError("Reactome input target-list SHA256 mismatch")
    ordered_targets = read_target_ids(target_path)
    if selection.get("selectedTargetCount") != len(ordered_targets) or selection.get("orderedEnsemblIds") != ordered_targets:
        raise ReactomeArtifactError("Reactome target-selection manifest does not match its target list")
    if counts["inputTargetIds"] != len(ordered_targets):
        raise ReactomeArtifactError("Reactome input-target count mismatch")
    targets = set(ordered_targets)
    if counts["uniqueInputTargetIds"] != len(targets):
        raise ReactomeArtifactError("Reactome unique input-target count mismatch")
    if any(record["ensemblGeneId"] not in targets for record in records):
        raise ReactomeArtifactError("Reactome frozen record is outside its selected target scope")
    return records, manifest


def derive_input_ensembl_targets(
    frozen_chembl_dir: Path,
    crosswalk_path: Path,
    pinned_open_targets_dir: Path,
    output_path: Path,
    *,
    max_drugs: int = 20,
    max_targets: int = 30,
    minimum_association_score: float = 0.3,
) -> list[str]:
    """Reproduce the existing pre-Reactome Ensembl entity ordering.

    This uses frozen ChEMBL plus its frozen crosswalk, then the pinned Open
    Targets reader, matching the historical builder's source append order.
    """
    from app.services.gnn.biomedical_graph import FrozenChEMBLAdapter, add_pinned_open_targets, canonicalize_drug_targets
    from app.services.gnn.target_crosswalk import load_crosswalk

    entities, relations = FrozenChEMBLAdapter(Path(frozen_chembl_dir)).collect(max_drugs)
    entities, relations = canonicalize_drug_targets(entities, relations, load_crosswalk(Path(crosswalk_path)))
    add_pinned_open_targets(entities, relations, Path(pinned_open_targets_dir), minimum_association_score)
    selected = [item["canonicalId"].split(":", 1)[1] for item in entities if item["entityType"] == "TARGET" and item["canonicalId"].startswith("ENSEMBL:")][:max_targets]
    if len(selected) != max_targets:
        raise ReactomeArtifactError(f"Only {len(selected)} Ensembl targets available; expected {max_targets}")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(selected) + "\n", encoding="utf-8")
    return selected


def acquire_release_97(
    target_list_path: Path,
    destination: Path,
    *,
    source_url: str = SOURCE_URL,
    opener: Callable[..., Any] = _urlopen,
    retrieved_at: str | None = None,
) -> dict[str, Any]:
    """Explicitly download, filter, and pin the authoritative release-97 mapping."""
    if source_url != SOURCE_URL:
        raise ReactomeArtifactError("Reactome acquisition source must be the authoritative release-97 mapping URL")
    selected = read_target_ids(Path(target_list_path))
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    target_destination = destination / TARGET_FILE
    target_destination.write_text("\n".join(selected) + "\n", encoding="utf-8")
    temporary = destination / f"{RECORD_FILE}.partial"
    matched_targets: set[str] = set()
    records: list[dict[str, str]] = []
    with opener(source_url) as response:
        for raw_line in response:
            fields = raw_line.decode("utf-8").rstrip("\r\n").split("\t")
            if len(fields) != len(RECORD_COLUMNS):
                raise ReactomeArtifactError("Unexpected authoritative Reactome mapping schema")
            record = dict(zip(RECORD_COLUMNS, fields))
            if record["ensemblGeneId"] not in selected:
                continue
            if record["species"] != "Homo sapiens" or not record["pathwayStableId"].startswith("R-HSA-"):
                continue
            record = _validate_record(record)
            records.append(record)
            matched_targets.add(record["ensemblGeneId"])
    records.sort(key=lambda item: tuple(item[column] for column in RECORD_COLUMNS))
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=RECORD_COLUMNS, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    temporary.replace(destination / RECORD_FILE)
    timestamp = retrieved_at or datetime.now(timezone.utc).isoformat()
    manifest = {
        "source": "Reactome",
        "release": RELEASE,
        "retrievedAt": timestamp,
        "authoritativeSourceUrl": source_url,
        "acquisitionMethod": "explicit_release_mapping_download_and_exact_ensembl_filter",
        "targetSelection": {
            "algorithm": "frozen_chembl_then_canonical_crosswalk_then_pinned_open_targets_then_first_30_ensembl_target_entities",
            "selectedTargetCount": len(selected),
            "inputTargetList": TARGET_FILE,
            "inputTargetListSha256": sha256_file(target_destination),
            "orderedEnsemblIds": selected,
        },
        "files": [{"name": RECORD_FILE, "sha256": sha256_file(destination / RECORD_FILE), "recordCount": len(records)}],
        "recordCounts": {"inputTargetIds": len(selected), "uniqueInputTargetIds": len(set(selected)), "matchedTargetIds": len(matched_targets), "unmatchedTargetIds": len(set(selected) - matched_targets), "pathwayMappings": len(records)},
    }
    (destination / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    """Expose acquisition as an intentional, opt-in developer command."""
    parser = argparse.ArgumentParser(description="Acquire and pin a bounded Reactome release-97 mapping artifact")
    subparsers = parser.add_subparsers(dest="command", required=True)
    acquire = subparsers.add_parser("acquire")
    acquire.add_argument("--target-ids-file", type=Path, required=True)
    acquire.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "acquire":
        print(json.dumps(acquire_release_97(args.target_ids_file, args.destination), indent=2))


if __name__ == "__main__":
    main()
