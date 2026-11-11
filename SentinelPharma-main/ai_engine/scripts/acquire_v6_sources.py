"""SentinelPharma V6: Source acquisition and verification script.

Downloads and validates:
1. UniProtKB Human ID mapping (HUMAN_9606_idmapping_selected.tab.gz)
2. Reactome 97 Ensembl pathway crosswalk (Ensembl2Reactome.txt)
3. Validates integrity of existing local ChEMBL 36 SQLite archive (chembl_36_sqlite.tar.gz)
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


DOWNLOAD_DIR = Path("c:/Users/Senthil Kumar/Downloads")
V6_MANIFEST_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "sources" / "v6_manifests"


def compute_sha256(path: Path, block_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(block_size):
            h.update(chunk)
    return h.hexdigest()


def download_file_with_resume(url: str, dest_path: Path, max_retries: int = 3) -> dict:
    """Downloads a file with HTTP Range resume support and returns metadata."""
    print(f"\n[Acquisition] Starting download: {url}")
    print(f"[Acquisition] Destination: {dest_path}")
    
    headers = {"User-Agent": "SentinelPharma/6.0-DataAcquisition"}
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".part")
    
    initial_bytes = temp_path.stat().st_size if temp_path.exists() else 0
    if initial_bytes > 0:
        headers["Range"] = f"bytes={initial_bytes}-"
        print(f"[Acquisition] Resuming from byte {initial_bytes:,}...")

    start_time = time.time()
    req = Request(url, headers=headers)
    
    with urlopen(req, timeout=30) as response:
        status_code = response.status
        content_length_header = response.headers.get("Content-Length")
        total_size = int(content_length_header) + initial_bytes if content_length_header else None
        last_modified = response.headers.get("Last-Modified")
        content_type = response.headers.get("Content-Type")

        mode = "ab" if initial_bytes > 0 and status_code == 206 else "wb"
        downloaded = initial_bytes if mode == "ab" else 0

        with open(temp_path, mode) as out_file:
            while chunk := response.read(1024 * 512):
                out_file.write(chunk)
                downloaded += len(chunk)
                if total_size:
                    pct = (downloaded / total_size) * 100
                    mb = downloaded / (1024 * 1024)
                    tot_mb = total_size / (1024 * 1024)
                    print(f"\r  Downloaded: {mb:.1f} MB / {tot_mb:.1f} MB ({pct:.1f}%)", end="", flush=True)
                else:
                    mb = downloaded / (1024 * 1024)
                    print(f"\r  Downloaded: {mb:.1f} MB", end="", flush=True)

    print()
    # Atomic rename upon completion
    if dest_path.exists():
        dest_path.unlink()
    temp_path.rename(dest_path)
    
    elapsed = time.time() - start_time
    file_size = dest_path.stat().st_size
    print(f"[Acquisition] Completed in {elapsed:.1f}s. Size: {file_size:,} bytes. Computing SHA-256...")
    sha256_hash = compute_sha256(dest_path)
    print(f"[Acquisition] SHA-256: {sha256_hash}")

    return {
        "url": url,
        "filePath": str(dest_path),
        "fileName": dest_path.name,
        "sizeBytes": file_size,
        "sha256": sha256_hash,
        "httpStatus": status_code,
        "contentType": content_type,
        "lastModified": last_modified,
        "downloadElapsedSec": round(elapsed, 2),
        "acquiredAt": datetime.now(timezone.utc).isoformat(),
    }


def validate_uniprot_idmapping(file_path: Path) -> dict:
    """Validates structure, row counts, and sample content of HUMAN_9606_idmapping_selected.tab.gz."""
    print(f"\n[Validation] Inspecting UniProt ID mapping: {file_path}")
    row_count = 0
    with_ensembl_count = 0
    sample_rows = []
    
    with gzip.open(file_path, "rt", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            row_count += 1
            parts = line.rstrip("\n").split("\t")
            # Column 0: UniProtKB-AC, Column 1: UniProtKB-ID, Column 18: Ensembl (0-indexed)
            if len(parts) > 18 and parts[18].strip():
                with_ensembl_count += 1
            if i < 3:
                sample_rows.append({
                    "uniprotAccession": parts[0] if len(parts) > 0 else None,
                    "uniprotId": parts[1] if len(parts) > 1 else None,
                    "geneSymbol": parts[2] if len(parts) > 2 else None,
                    "ensemblMappings": parts[18] if len(parts) > 18 else None,
                })
            if row_count % 50000 == 0:
                print(f"  Scanned {row_count:,} UniProt records...", end="\r", flush=True)

    print(f"\n[Validation] Total UniProt Human records: {row_count:,}")
    print(f"[Validation] Records with Ensembl mappings: {with_ensembl_count:,} ({with_ensembl_count/row_count*100:.1f}%)")
    return {
        "valid": row_count > 100000 and with_ensembl_count > 50000,
        "totalRecords": row_count,
        "recordsWithEnsembl": with_ensembl_count,
        "samples": sample_rows,
    }


def validate_reactome_pathways(file_path: Path) -> dict:
    """Validates structure, column layout, species, and unique Ensembl genes in Ensembl2Reactome.txt."""
    print(f"\n[Validation] Inspecting Reactome pathway file: {file_path}")
    total_rows = 0
    human_rows = 0
    unique_genes = set()
    unique_pathways = set()
    sample_rows = []

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            total_rows += 1
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 6:
                gene_id, pathway_id, url, name, evidence, species = parts[:6]
                if species == "Homo sapiens":
                    human_rows += 1
                    unique_genes.add(gene_id)
                    unique_pathways.add(pathway_id)
                if i < 3:
                    sample_rows.append({
                        "geneId": gene_id,
                        "pathwayId": pathway_id,
                        "name": name,
                        "evidence": evidence,
                        "species": species,
                    })
            if total_rows % 50000 == 0:
                print(f"  Scanned {total_rows:,} Reactome rows...", end="\r", flush=True)

    print(f"\n[Validation] Total Reactome mappings: {total_rows:,}")
    print(f"[Validation] Human mappings: {human_rows:,}")
    print(f"[Validation] Unique Human Ensembl Genes: {len(unique_genes):,}")
    print(f"[Validation] Unique Human Pathways: {len(unique_pathways):,}")
    return {
        "valid": human_rows > 50000 and len(unique_genes) > 10000,
        "totalRows": total_rows,
        "humanRows": human_rows,
        "uniqueHumanGenes": len(unique_genes),
        "uniqueHumanPathways": len(unique_pathways),
        "samples": sample_rows,
    }


def validate_local_chembl_archive(archive_path: Path) -> dict:
    """Validates local chembl_36_sqlite.tar.gz archive members and header integrity without full extraction."""
    print(f"\n[Validation] Inspecting local ChEMBL 36 archive: {archive_path}")
    if not archive_path.exists():
        return {"exists": False, "valid": False, "error": "File not found"}

    file_size = archive_path.stat().st_size
    print(f"  Archive Size: {file_size:,} bytes ({file_size / (1024**3):.2f} GiB)")

    members_info = []
    has_db = False
    db_size = 0
    db_member_name = None

    with tarfile.open(archive_path, "r:gz") as tar:
        for m in tar.getmembers():
            members_info.append({"name": m.name, "size": m.size, "isdir": m.isdir()})
            if m.name.endswith(".db"):
                has_db = True
                db_size = m.size
                db_member_name = m.name

    print(f"[Validation] Archive members found: {len(members_info)}")
    for m in members_info:
        print(f"  - {m['name']} ({m['size']:,} bytes)")

    return {
        "exists": True,
        "valid": has_db and db_size > 20 * (1024**3),
        "archiveSizeBytes": file_size,
        "dbMemberName": db_member_name,
        "dbUncompressedSizeBytes": db_size,
        "dbUncompressedGiB": round(db_size / (1024**3), 2),
    }


def main():
    print("=================================================================")
    print("      SentinelPharma V6 Bulk Source Acquisition & Validation      ")
    print("=================================================================")

    # 1. Check disk space before proceeding
    total, used, free = shutil.disk_usage(DOWNLOAD_DIR)
    print(f"Drive Space: Total {total/(1024**3):.1f} GB | Free {free/(1024**3):.1f} GB")

    results = {}

    # 2. Acquire UniProt Human ID Mapping
    uniprot_url = "https://ftp.uniprot.org/pub/databases/uniprot/current_release/knowledgebase/idmapping/by_organism/HUMAN_9606_idmapping_selected.tab.gz"
    uniprot_dest = DOWNLOAD_DIR / "HUMAN_9606_idmapping_selected.tab.gz"
    uniprot_meta = download_file_with_resume(uniprot_url, uniprot_dest)
    uniprot_val = validate_uniprot_idmapping(uniprot_dest)
    results["uniprot"] = {"meta": uniprot_meta, "validation": uniprot_val}

    # 3. Acquire Reactome 97 Ensembl Pathway file
    reactome_url = "https://download.reactome.org/97/Ensembl2Reactome.txt"
    reactome_dest = DOWNLOAD_DIR / "Ensembl2Reactome.txt"
    reactome_meta = download_file_with_resume(reactome_url, reactome_dest)
    reactome_val = validate_reactome_pathways(reactome_dest)
    results["reactome"] = {"meta": reactome_meta, "validation": reactome_val}

    # 4. Validate existing local ChEMBL 36 archive
    chembl_archive = DOWNLOAD_DIR / "chembl_36_sqlite.tar.gz"
    chembl_val = validate_local_chembl_archive(chembl_archive)
    results["chembl36"] = chembl_val

    # 5. Disk usage after acquisition
    total_after, used_after, free_after = shutil.disk_usage(DOWNLOAD_DIR)
    results["diskUsage"] = {
        "freeGiBBefore": round(free / (1024**3), 2),
        "freeGiBAfter": round(free_after / (1024**3), 2),
        "consumedGiB": round((free - free_after) / (1024**3), 2),
    }

    # 6. Save acquisition audit manifest
    V6_MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = V6_MANIFEST_DIR / "v6_bulk_sources_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\n======================= Acquisition Summary =======================")
    print(f"UniProt Human ID Mapping:  {'SUCCESS' if uniprot_val['valid'] else 'FAILED'}")
    print(f"  Records: {uniprot_val['totalRecords']:,} total, {uniprot_val['recordsWithEnsembl']:,} with Ensembl")
    print(f"  SHA-256: {uniprot_meta['sha256']}")
    print(f"Reactome 97 Pathway File:  {'SUCCESS' if reactome_val['valid'] else 'FAILED'}")
    print(f"  Human Mappings: {reactome_val['humanRows']:,} across {reactome_val['uniqueHumanGenes']:,} genes and {reactome_val['uniqueHumanPathways']:,} pathways")
    print(f"  SHA-256: {reactome_meta['sha256']}")
    print(f"ChEMBL 36 Archive:         {'VALID & READY' if chembl_val['valid'] else 'FAILED'}")
    print(f"  Database Member: {chembl_val.get('dbMemberName')} ({chembl_val.get('dbUncompressedGiB')} GiB uncompressed)")
    print(f"Disk Space Remaining:      {free_after / (1024**3):.2f} GiB")
    print(f"Manifest written to:       {manifest_path}")
    print("===================================================================\n")


if __name__ == "__main__":
    main()
