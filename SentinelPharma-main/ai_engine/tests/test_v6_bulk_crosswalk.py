"""Focused automated tests for SentinelPharma V6 bulk ChEMBL → UniProt → Ensembl crosswalk."""
import gzip
import json
import sqlite3
from pathlib import Path
import pytest


DB_PATH = Path("c:/Users/Senthil Kumar/Downloads/chembl_36_sqlite/chembl_36.db")
UNIPROT_PATH = Path("c:/Users/Senthil Kumar/Downloads/HUMAN_9606_idmapping_selected.tab.gz")
SNAPSHOT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "target_crosswalks" / "v6_clinical_targets_snapshot"


def test_chembl36_database_integrity():
    """Verifies that the extracted ChEMBL 36 SQLite database is intact and queryable."""
    assert DB_PATH.exists(), f"Database not found at {DB_PATH}"
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    c = conn.cursor()

    c.execute("PRAGMA quick_check;")
    check = c.fetchall()
    assert check == [("ok",)], f"PRAGMA quick_check returned: {check}"

    c.execute("SELECT count(*) FROM target_dictionary;")
    targets = c.fetchone()[0]
    assert targets >= 17000, f"Unexpected target count: {targets}"

    c.execute("SELECT count(*) FROM drug_mechanism;")
    mechs = c.fetchone()[0]
    assert mechs >= 7000, f"Unexpected mechanism count: {mechs}"

    conn.close()


def test_uniprot_human_idmapping_format_and_lookup():
    """Verifies that the downloaded UniProt ID mapping correctly resolves canonical Ensembl gene IDs."""
    assert UNIPROT_PATH.exists(), f"UniProt file not found at {UNIPROT_PATH}"
    
    test_accs = {
        "P03372": ["ENSG00000091831"],  # ESR1 (exact)
        "P30556": ["ENSG00000144891"],  # AGTR1 (exact)
        "P35462": ["ENSG00000151577"],  # DRD3 (exact)
        "P35354": ["ENSG00000073756"],  # PTGS2 (exact)
        "P23219": ["ENSG00000095303"],  # PTGS1 (exact)
        "Q01959": ["ENSG00000142319", "ENSG00000276996"],  # KCNH2 (one-to-many)
    }

    results = {}
    with gzip.open(UNIPROT_PATH, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            acc = parts[0]
            if acc in test_accs:
                ens_field = parts[18] if len(parts) > 18 else ""
                genes = set()
                for item in ens_field.split(";"):
                    clean = item.strip().split(".")[0].strip()
                    if clean.startswith("ENSG"):
                        genes.add(clean)
                results[acc] = sorted(genes)
            if len(results) == len(test_accs):
                break

    for acc, expected in test_accs.items():
        assert acc in results, f"Missing accession {acc} in UniProt mapping"
        assert results[acc] == expected, f"Mismatch for {acc}: expected {expected}, got {results[acc]}"


def test_v6_bulk_clinical_targets_snapshot_metrics():
    """Verifies that the generated V6 bulk clinical targets snapshot meets all coverage thresholds."""
    stats_file = SNAPSHOT_DIR / "coverage_statistics.json"
    cw_file = SNAPSHOT_DIR / "target_crosswalk.json"

    assert stats_file.exists(), f"Statistics file missing at {stats_file}"
    assert cw_file.exists(), f"Crosswalk file missing at {cw_file}"

    with open(stats_file, "r", encoding="utf-8") as f:
        stats_data = json.load(f)

    stats = stats_data["coverageStatistics"]
    assert stats["totalTargets"] == 5864
    assert stats["humanTargets"] == 3762
    assert stats["nonHumanTargets"] == 2102

    # Human target resolution
    assert stats["targetResolution"]["totalUsableHuman"] == 2530
    assert stats["targetResolution"]["resolved"] >= 2500
    assert stats["targetResolution"]["partiallyResolved"] >= 5

    # Curated mechanisms resolution
    assert stats["curatedMechanismTargets"]["total"] == 1505
    assert stats["curatedMechanismTargets"]["human"] == 1209
    assert stats["curatedMechanismTargets"]["usable"] == 1101
    assert stats["curatedMechanismTargets"]["mechanismResolutionRatePct"] >= 90.0

    # Gene and component counts
    assert stats["uniqueEnsemblGenesMapped"] >= 3000
    assert stats["componentMappings"]["exact"] >= 3400
    assert stats["componentMappings"]["oneToMany"] >= 250

    # Unresolved taxonomy reasons
    assert stats["unresolvedBreakdown"]["nonHuman"] == 2102
    assert stats["unresolvedBreakdown"]["noEnsemblMapping"] >= 50
    assert stats["unresolvedBreakdown"]["noComponentAccession"] >= 1100


def test_v6_bulk_clinical_targets_spot_checks():
    """Spot-checks key clinical drug targets in the bulk snapshot for exact Ensembl normalization and provenance."""
    cw_file = SNAPSHOT_DIR / "target_crosswalk.json"
    with open(cw_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    entry_map = {e["chemblTargetId"]: e for e in data["entries"]}

    # Spot check: CHEMBL206 (ESR1)
    esr1 = entry_map["CHEMBL206"]
    assert esr1["targetResolutionStatus"] == "RESOLVED"
    assert esr1["canonicalEnsemblGeneIds"] == ["ENSG00000091831"]
    assert esr1["components"][0]["mappingStatus"] == "EXACT"
    assert esr1["components"][0]["uniprotId"] == "P03372"

    # Spot check: CHEMBL2094253 (PTGS1 + PTGS2)
    cox = entry_map["CHEMBL2094253"]
    assert cox["isMultiProtein"] is True
    assert cox["targetComplexity"] == "PROTEIN_FAMILY"
    assert cox["targetResolutionStatus"] == "RESOLVED"
    assert set(cox["canonicalEnsemblGeneIds"]) == {"ENSG00000073756", "ENSG00000095303"}

    # Spot check: CHEMBL238 (KCNH2)
    kcnh2 = entry_map["CHEMBL238"]
    assert kcnh2["targetResolutionStatus"] == "RESOLVED"
    assert kcnh2["components"][0]["mappingStatus"] == "ONE_TO_MANY"
    assert kcnh2["components"][0]["ambiguityReason"] == "MULTIPLE_GENE_LOCI"
    assert len(kcnh2["canonicalEnsemblGeneIds"]) == 2

    # Spot check: CHEMBL2311224 (Bacterial target)
    bact = entry_map["CHEMBL2311224"]
    assert bact["targetResolutionStatus"] == "UNRESOLVED"
    assert bact["targetComplexity"] == "NON_HUMAN"
    assert bact["canonicalEnsemblGeneIds"] == []
    assert bact["components"][0]["reason"] == "NON_HUMAN"

    # Verify all mapped Ensembl IDs across the entire file are normalized
    for entry in data["entries"][:100]:
        for gid in entry["canonicalEnsemblGeneIds"]:
            assert gid.startswith("ENSG"), f"Unnormalized gene ID: {gid}"
            assert "." not in gid, f"Version dot found in gene ID: {gid}"
