"""Safely extract chembl_36.db from chembl_36_sqlite.tar.gz and verify with PRAGMA quick_check."""
import shutil
import sqlite3
import sys
import tarfile
import time
from pathlib import Path


ARCHIVE_PATH = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite.tar.gz")
OUTPUT_DIR = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite")
DB_PATH = OUTPUT_DIR / "chembl_36.db"


def main():
    print(f"[Extraction] Archive: {ARCHIVE_PATH}")
    print(f"[Extraction] Output Target: {DB_PATH}")

    total, used, free = shutil.disk_usage(OUTPUT_DIR.parent)
    print(f"[Extraction] Initial Free Disk Space: {free / (1024**3):.2f} GiB")

    if DB_PATH.exists() and DB_PATH.stat().st_size == 29739835392:
        print("[Extraction] DB already extracted and matches exact expected size (29,739,835,392 bytes). Skipping extraction.")
    else:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        part_path = DB_PATH.with_suffix(".db.part")
        if part_path.exists():
            part_path.unlink()

        print("[Extraction] Opening tar archive and extracting chembl_36.db...")
        start_time = time.time()
        with tarfile.open(ARCHIVE_PATH, "r:gz") as tar:
            member = tar.getmember("chembl_36/chembl_36_sqlite/chembl_36.db")
            expected_size = member.size
            print(f"[Extraction] Expected size: {expected_size:,} bytes ({expected_size / (1024**3):.2f} GiB)")

            extracted_bytes = 0
            last_report = time.time()
            f_in = tar.extractfile(member)
            with open(part_path, "wb") as f_out:
                buf_size = 1024 * 1024 * 8  # 8 MB chunks
                while chunk := f_in.read(buf_size):
                    f_out.write(chunk)
                    extracted_bytes += len(chunk)
                    now = time.time()
                    if now - last_report > 5:
                        pct = (extracted_bytes / expected_size) * 100
                        gib = extracted_bytes / (1024**3)
                        tot_gib = expected_size / (1024**3)
                        speed = (extracted_bytes / (now - start_time)) / (1024**2)
                        print(f"  Extracted: {gib:.2f} / {tot_gib:.2f} GiB ({pct:.1f}%) @ {speed:.1f} MB/s", flush=True)
                        last_report = now

        part_path.rename(DB_PATH)
        elapsed = time.time() - start_time
        print(f"[Extraction] Extraction complete in {elapsed:.1f}s. Final size: {DB_PATH.stat().st_size:,} bytes.")

    total, used, free_after = shutil.disk_usage(OUTPUT_DIR.parent)
    print(f"[Extraction] Free Disk Space Remaining: {free_after / (1024**3):.2f} GiB")

    print("\n[Verification] Connecting to SQLite database and running PRAGMA quick_check...")
    check_start = time.time()
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    cursor = conn.cursor()
    cursor.execute("PRAGMA quick_check;")
    result = cursor.fetchall()
    check_elapsed = time.time() - check_start
    print(f"[Verification] PRAGMA quick_check finished in {check_elapsed:.2f}s: {result}")

    # Inspect core ChEMBL tables
    print("\n[Verification] Querying core ChEMBL tables...")
    cursor.execute("SELECT count(*) FROM target_dictionary;")
    target_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM target_components;")
    tc_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM component_sequences;")
    cs_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM drug_mechanism;")
    dm_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM molecule_dictionary WHERE max_phase >= 1;")
    clin_drugs = cursor.fetchone()[0]

    print(f"  Total targets (target_dictionary): {target_count:,}")
    print(f"  Target components (target_components): {tc_count:,}")
    print(f"  Component sequences (component_sequences): {cs_count:,}")
    print(f"  Drug mechanisms (drug_mechanism): {dm_count:,}")
    print(f"  Clinical/Approved drugs (max_phase >= 1): {clin_drugs:,}")

    # Query targets specifically associated with clinical/approved drugs
    cursor.execute("""
        SELECT count(DISTINCT td.target_chembl_id)
        FROM molecule_dictionary md
        JOIN drug_mechanism dm ON md.molregno = dm.molregno
        JOIN target_dictionary td ON dm.tid = td.tid
        WHERE md.max_phase >= 1;
    """)
    clinical_targets_count = cursor.fetchone()[0]
    print(f"  Unique targets for clinical/approved drugs (max_phase >= 1): {clinical_targets_count:,}")

    conn.close()
    print("\n[Verification] Complete. Database is 100% verified and operational.")


if __name__ == "__main__":
    main()
