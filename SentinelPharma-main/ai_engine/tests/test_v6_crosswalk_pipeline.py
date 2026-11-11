"""Tests for SentinelPharma V6 Phase 1: ChEMBL target → UniProt → Ensembl crosswalk pipeline.

Verifies:
- Offline local artifact indexing without external network calls
- Exact 1-to-1 human single-protein targets (ESR1, AGTR1, NR3C2)
- Multi-protein target complexes and families (PTGS1/PTGS2, GABA-A receptor)
- Partial resolution multi-protein targets (NMDA receptor complex with unmapped subunit)
- Ambiguous 1-to-many gene loci mappings (KCNH2, CA family)
- Non-human organism rejection (Bacteria targets)
- Reviewed Swiss-Prot status preservation and provenance tracking
- Full coverage statistics computation and artifact persistence
"""
import json
from pathlib import Path
import pytest

from app.services.gnn.v6_crosswalk_builder import (
    DEFAULT_ARTIFACTS_DIR,
    V6TargetCrosswalkBuilder,
)


@pytest.fixture
def builder():
    b = V6TargetCrosswalkBuilder(artifacts_dir=DEFAULT_ARTIFACTS_DIR)
    b.index_sources()
    return b


def test_v6_crosswalk_builder_initialization_and_offline_indexing(builder):
    """Builder must index existing local artifacts offline without network."""
    available_ids = builder.get_available_target_ids()
    assert len(available_ids) >= 17
    # Key targets must all be discovered in local source artifacts
    assert "CHEMBL206" in available_ids
    assert "CHEMBL227" in available_ids
    assert "CHEMBL2094253" in available_ids
    assert "CHEMBL238" in available_ids
    assert "CHEMBL2364670" in available_ids


def test_exact_single_protein_human_target_mapping(builder):
    """Single human proteins must resolve to canonical Ensembl gene IDs with Swiss-Prot reviewed status."""
    # CHEMBL206 = Estrogen receptor (ESR1)
    res_206 = builder.resolve_target("CHEMBL206")
    assert res_206["chemblTargetId"] == "CHEMBL206"
    assert res_206["organism"] == "Homo sapiens"
    assert res_206["targetComplexity"] == "SINGLE_PROTEIN"
    assert res_206["isMultiProtein"] is False
    assert res_206["targetResolutionStatus"] == "RESOLVED"
    assert res_206["canonicalEnsemblGeneIds"] == ["ENSG00000091831"]

    comp = res_206["components"][0]
    assert comp["uniprotId"] == "P03372"
    assert comp["geneSymbol"] == "ESR1"
    assert comp["mappingStatus"] == "EXACT"
    assert comp["isReviewed"] is True
    assert comp["reviewStatus"] == "REVIEWED"
    assert comp["reason"] is None
    assert comp["ensemblGeneIds"] == ["ENSG00000091831"]
    assert "provenance" in comp
    assert comp["provenance"]["uniprotEntryType"] == "UniProtKB reviewed (Swiss-Prot)"

    # CHEMBL227 = Angiotensin II type 1 receptor (AGTR1)
    res_227 = builder.resolve_target("CHEMBL227")
    assert res_227["targetResolutionStatus"] == "RESOLVED"
    assert res_227["canonicalEnsemblGeneIds"] == ["ENSG00000144891"]
    assert res_227["components"][0]["geneSymbol"] == "AGTR1"

    # CHEMBL234 = Dopamine D3 receptor (DRD3)
    res_234 = builder.resolve_target("CHEMBL234")
    assert res_234["targetResolutionStatus"] == "RESOLVED"
    assert res_234["canonicalEnsemblGeneIds"] == ["ENSG00000151577"]
    assert res_234["components"][0]["geneSymbol"] == "DRD3"


def test_multi_protein_family_and_complex_resolution(builder):
    """Multi-protein targets must resolve all components independently with proper complexity flags."""
    # CHEMBL2094253 = Cyclooxygenase family (PTGS1 and PTGS2)
    res_cox = builder.resolve_target("CHEMBL2094253")
    assert res_cox["chemblTargetId"] == "CHEMBL2094253"
    assert res_cox["isMultiProtein"] is True
    assert res_cox["targetComplexity"] == "PROTEIN_FAMILY"
    assert res_cox["targetResolutionStatus"] == "RESOLVED"
    assert len(res_cox["components"]) == 2

    # Verify both PTGS1 and PTGS2 genes are captured
    assert "ENSG00000073756" in res_cox["canonicalEnsemblGeneIds"]  # PTGS2 / COX-2
    assert "ENSG00000095303" in res_cox["canonicalEnsemblGeneIds"]  # PTGS1 / COX-1

    comp_cox2 = next(c for c in res_cox["components"] if c["uniprotId"] == "P35354")
    assert comp_cox2["geneSymbol"] == "PTGS2"
    assert comp_cox2["mappingStatus"] == "EXACT"
    assert comp_cox2["ensemblGeneIds"] == ["ENSG00000073756"]

    comp_cox1 = next(c for c in res_cox["components"] if c["uniprotId"] == "P23219")
    assert comp_cox1["geneSymbol"] == "PTGS1"
    assert comp_cox1["mappingStatus"] == "EXACT"
    assert comp_cox1["ensemblGeneIds"] == ["ENSG00000095303"]

    # CHEMBL1907589 = GABA-A receptor complex (GABRA1 + GABRB2)
    res_gaba = builder.resolve_target("CHEMBL1907589")
    assert res_gaba["isMultiProtein"] is True
    assert res_gaba["targetComplexity"] == "PROTEIN_COMPLEX"
    assert res_gaba["targetResolutionStatus"] == "RESOLVED"
    assert len(res_gaba["components"]) == 2
    assert res_gaba["canonicalEnsemblGeneIds"] == ["ENSG00000101204", "ENSG00000160716"]


def test_partial_resolution_multi_protein_complex(builder):
    """Multi-protein complex with an unmapped subunit must be PARTIALLY_RESOLVED without failing closed."""
    # CHEMBL2111348 = NMDA receptor subunit complex group (Q02153, O75343, P33402, Q02108)
    res_nmda = builder.resolve_target("CHEMBL2111348")
    assert res_nmda["chemblTargetId"] == "CHEMBL2111348"
    assert res_nmda["isMultiProtein"] is True
    assert res_nmda["targetComplexity"] == "PROTEIN_COMPLEX_GROUP"
    assert res_nmda["targetResolutionStatus"] == "PARTIALLY_RESOLVED"
    assert len(res_nmda["components"]) == 4

    # O75343 lacks Ensembl mapping in UniProt
    unmapped_comp = next(c for c in res_nmda["components"] if c["uniprotId"] == "O75343")
    assert unmapped_comp["mappingStatus"] == "UNRESOLVED"
    assert unmapped_comp["reason"] == "NO_EXACT_ENSEMBL_MAPPING"
    assert unmapped_comp["ensemblGeneIds"] == []

    # Other 3 components must be exact
    exact_comps = [c for c in res_nmda["components"] if c["mappingStatus"] == "EXACT"]
    assert len(exact_comps) == 3
    assert len(res_nmda["canonicalEnsemblGeneIds"]) == 3
    assert "ENSG00000061918" in res_nmda["canonicalEnsemblGeneIds"]


def test_ambiguous_one_to_many_mappings(builder):
    """UniProt accessions mapping to multiple Ensembl Gene IDs must be classified as ONE_TO_MANY."""
    # CHEMBL238 = KCNH2 / hERG (UniProt Q01959 maps to 2 gene loci)
    res_238 = builder.resolve_target("CHEMBL238")
    assert res_238["targetResolutionStatus"] == "RESOLVED"
    comp_238 = res_238["components"][0]
    assert comp_238["uniprotId"] == "Q01959"
    assert comp_238["mappingStatus"] == "ONE_TO_MANY"
    assert comp_238["ambiguityReason"] == "MULTIPLE_GENE_LOCI"
    assert len(comp_238["ensemblGeneIds"]) == 2
    assert "ENSG00000142319" in comp_238["ensemblGeneIds"]
    assert "ENSG00000276996" in comp_238["ensemblGeneIds"]

    # CHEMBL2363070 = Carbonic anhydrase family (contains P28702 with 6 gene loci)
    res_ca = builder.resolve_target("CHEMBL2363070")
    assert res_ca["targetResolutionStatus"] == "RESOLVED"
    comp_p28702 = next(c for c in res_ca["components"] if c["uniprotId"] == "P28702")
    assert comp_p28702["mappingStatus"] == "ONE_TO_MANY"
    assert len(comp_p28702["ensemblGeneIds"]) == 6
    assert comp_p28702["ambiguityReason"] == "MULTIPLE_GENE_LOCI"


def test_unmapped_non_human_organism_rejection(builder):
    """Non-human organism targets must be explicitly marked UNRESOLVED with reason NON_HUMAN."""
    non_human_ids = ["CHEMBL2311224", "CHEMBL2354204", "CHEMBL2363076", "CHEMBL2364670"]
    for tid in non_human_ids:
        res = builder.resolve_target(tid)
        assert res["organism"] == "Bacteria"
        assert res["targetComplexity"] == "NON_HUMAN"
        assert res["targetResolutionStatus"] == "UNRESOLVED"
        assert res["canonicalEnsemblGeneIds"] == []
        assert res["components"][0]["mappingStatus"] == "UNRESOLVED"
        assert res["components"][0]["reason"] == "NON_HUMAN"
        assert res["components"][0]["reviewStatus"] == "NOT_APPLICABLE"


def test_coverage_statistics_and_provenance_integrity(builder):
    """Coverage statistics must report accurate totals, rates, and preserve provenance."""
    representative_batch = [
        "CHEMBL206", "CHEMBL227", "CHEMBL234", "CHEMBL222", "CHEMBL1871", "CHEMBL1876", "CHEMBL235",
        "CHEMBL2094253", "CHEMBL1907589", "CHEMBL2093872",
        "CHEMBL2111348",
        "CHEMBL238", "CHEMBL2363070",
        "CHEMBL2311224", "CHEMBL2354204", "CHEMBL2363076", "CHEMBL2364670"
    ]
    snapshot = builder.build_crosswalk(target_ids=representative_batch)
    assert snapshot["version"] == "chembl-uniprot-ensembl-v6-phase1"
    assert snapshot["targetCount"] == 17

    stats = snapshot["coverageStatistics"]
    assert stats["totalTargets"] == 17
    assert stats["humanTargets"] == 13
    assert stats["nonHumanTargets"] == 4
    assert stats["singleProteinTargets"] == 8
    assert stats["multiProteinTargets"] == 5

    # Human resolution: 12 fully resolved + 1 partially resolved = 13 usable (100%)
    assert stats["targetResolution"]["resolved"] == 12
    assert stats["targetResolution"]["partiallyResolved"] == 1
    assert stats["targetResolution"]["unresolved"] == 4
    assert stats["targetResolution"]["humanResolutionRatePct"] == 100.0

    # Components: 32 exact + 2 one-to-many + 5 unresolved = 39 components
    assert stats["componentMappings"]["totalComponents"] == 39
    assert stats["componentMappings"]["exact"] == 32
    assert stats["componentMappings"]["oneToMany"] == 2
    assert stats["componentMappings"]["unresolved"] == 5
    assert stats["unresolvedBreakdown"]["nonHuman"] == 4
    assert stats["unresolvedBreakdown"]["noEnsemblMapping"] == 1

    # Swiss-Prot reviewed curation status: 100% of human mapped components
    assert stats["curationStatus"]["reviewedSwissProt"] == 35
    assert stats["curationStatus"]["reviewedRatePct"] == 100.0
    assert stats["uniqueEnsemblGenes"] == 40


def test_snapshot_persistence_and_file_reproducibility(tmp_path, builder):
    """Snapshot saving must generate valid JSON files for both crosswalk and coverage report."""
    test_batch = ["CHEMBL206", "CHEMBL2094253", "CHEMBL2364670"]
    snapshot = builder.build_crosswalk(target_ids=test_batch)

    cw_file, stats_file = builder.save_snapshot(snapshot, tmp_path)
    assert cw_file.exists()
    assert stats_file.exists()

    with open(cw_file, "r", encoding="utf-8") as f:
        loaded_cw = json.load(f)
    assert loaded_cw["targetCount"] == 3
    assert len(loaded_cw["entries"]) == 3

    with open(stats_file, "r", encoding="utf-8") as f:
        loaded_stats = json.load(f)
    assert loaded_stats["coverageStatistics"]["totalTargets"] == 3
    assert loaded_stats["coverageStatistics"]["humanTargets"] == 2
    assert loaded_stats["coverageStatistics"]["nonHumanTargets"] == 1
