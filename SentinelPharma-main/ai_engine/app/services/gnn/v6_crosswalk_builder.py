"""SentinelPharma V6 Phase 1: Authoritative ChEMBL target → UniProt → Ensembl crosswalk builder.

Operates purely offline using local source artifacts.
Handles reviewed mappings (Swiss-Prot vs TrEMBL), multi-protein targets (families/complexes),
ambiguous identifiers (one-to-many loci), and unmapped targets (non-human, unlinked) explicitly.
Preserves granular provenance and computes complete coverage statistics.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple


DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parents[3] / "artifacts"


class V6TargetCrosswalkBuilder:
    """Offline-capable, reproducible crosswalk builder from ChEMBL targets to UniProt and Ensembl."""

    def __init__(
        self,
        artifacts_dir: Optional[Path] = None,
        targets_json_path: Optional[Path] = None,
        uniprot_cache_dirs: Optional[List[Path]] = None,
        chembl_cache_dirs: Optional[List[Path]] = None,
        controlled_crosswalk_paths: Optional[List[Path]] = None,
    ):
        self.artifacts_dir = Path(artifacts_dir) if artifacts_dir else DEFAULT_ARTIFACTS_DIR
        
        self.targets_json_path = (
            Path(targets_json_path)
            if targets_json_path
            else self.artifacts_dir / "chembl" / "36" / "frozen_20" / "targets.json"
        )
        
        self.uniprot_cache_dirs = (
            [Path(p) for p in uniprot_cache_dirs]
            if uniprot_cache_dirs is not None
            else [
                self.artifacts_dir / "target_crosswalks" / "controlled_v1" / "cache" / "uniprot",
                self.artifacts_dir / "target_crosswalks" / "phase2gb_frozen20_v1" / "incremental" / "cache" / "uniprot",
            ]
        )
        
        self.chembl_cache_dirs = (
            [Path(p) for p in chembl_cache_dirs]
            if chembl_cache_dirs is not None
            else [
                self.artifacts_dir / "target_crosswalks" / "controlled_v1" / "cache" / "chembl",
                self.artifacts_dir / "target_crosswalks" / "phase2gb_frozen20_v1" / "incremental" / "cache" / "chembl",
            ]
        )

        self.controlled_crosswalk_paths = (
            [Path(p) for p in controlled_crosswalk_paths]
            if controlled_crosswalk_paths is not None
            else [
                self.artifacts_dir / "target_crosswalks" / "controlled_v1" / "target_crosswalk.json",
                self.artifacts_dir / "target_crosswalks" / "phase2gb_frozen20_v1" / "target_crosswalk.json",
            ]
        )

        self._chembl_index: Dict[str, Tuple[Dict[str, Any], str]] = {}
        self._uniprot_cache: Dict[str, Tuple[Dict[str, Any], str]] = {}
        self._controlled_cache: Dict[str, Dict[str, Any]] = {}
        self._indexed = False

    def index_sources(self) -> None:
        """Indexes all local source artifacts into memory for fast, deterministic resolution."""
        if self._indexed:
            return

        # 1. Load targets.json if present
        if self.targets_json_path.exists():
            try:
                with open(self.targets_json_path, "r", encoding="utf-8-sig") as f:
                    targets = json.load(f)
                    for t in targets:
                        tid = t.get("target_chembl_id")
                        if tid:
                            self._chembl_index[tid] = (t, str(self.targets_json_path.relative_to(self.artifacts_dir) if self.targets_json_path.is_relative_to(self.artifacts_dir) else self.targets_json_path))
            except Exception as e:
                pass

        # 2. Load cached individual ChEMBL files
        for cdir in self.chembl_cache_dirs:
            if cdir.exists():
                for cfile in cdir.glob("*.json"):
                    tid = cfile.stem
                    if tid not in self._chembl_index:
                        try:
                            with open(cfile, "r", encoding="utf-8-sig") as f:
                                t = json.load(f)
                                if isinstance(t, dict):
                                    rel_path = str(cfile.relative_to(self.artifacts_dir) if cfile.is_relative_to(self.artifacts_dir) else cfile)
                                    self._chembl_index[tid] = (t, rel_path)
                        except Exception:
                            pass

        # 3. Load cached individual UniProt files
        for udir in self.uniprot_cache_dirs:
            if udir.exists():
                for ufile in udir.glob("*.json"):
                    acc = ufile.stem
                    if acc not in self._uniprot_cache:
                        try:
                            with open(ufile, "r", encoding="utf-8-sig") as f:
                                u = json.load(f)
                                if isinstance(u, dict):
                                    rel_path = str(ufile.relative_to(self.artifacts_dir) if ufile.is_relative_to(self.artifacts_dir) else ufile)
                                    self._uniprot_cache[acc] = (u, rel_path)
                        except Exception:
                            pass

        # 4. Load baseline controlled crosswalk entries
        for cw_path in self.controlled_crosswalk_paths:
            if cw_path.exists():
                try:
                    with open(cw_path, "r", encoding="utf-8-sig") as f:
                        cw = json.load(f)
                        for entry in cw.get("entries", []):
                            tid = entry.get("chemblTargetId")
                            if tid and tid not in self._controlled_cache:
                                self._controlled_cache[tid] = entry
                except Exception:
                    pass

        self._indexed = True

    def get_available_target_ids(self) -> List[str]:
        """Returns sorted list of all ChEMBL target IDs discovered in local artifacts."""
        self.index_sources()
        all_ids = set(self._chembl_index.keys()).union(self._controlled_cache.keys())
        return sorted(all_ids)

    def resolve_target(self, target_id: str) -> Dict[str, Any]:
        """Resolves a single ChEMBL target to UniProt and Ensembl with explicit taxonomy handling."""
        self.index_sources()
        now_ts = datetime.now(timezone.utc).isoformat()

        if target_id not in self._chembl_index:
            # Check if controlled crosswalk entry exists as fallback
            if target_id in self._controlled_cache:
                fallback_entry = self._controlled_cache[target_id]
                return self._enrich_controlled_entry(fallback_entry, now_ts)
            
            return {
                "chemblTargetId": target_id,
                "prefName": None,
                "targetType": None,
                "organism": None,
                "targetComplexity": "UNRESOLVED",
                "isMultiProtein": False,
                "targetResolutionStatus": "UNRESOLVED",
                "canonicalEnsemblGeneIds": [],
                "components": [
                    {
                        "chemblTargetId": target_id,
                        "chemblComponentId": None,
                        "uniprotId": None,
                        "geneSymbol": None,
                        "componentType": None,
                        "isReviewed": False,
                        "reviewStatus": "NOT_APPLICABLE",
                        "mappingStatus": "UNRESOLVED",
                        "mappingMethod": "NONE",
                        "reason": "SOURCE_TARGET_NOT_FOUND",
                        "ambiguityReason": None,
                        "ensemblGeneIds": [],
                        "provenance": {
                            "sourceArtifact": None,
                            "mappedAt": now_ts,
                        },
                    }
                ],
                "provenance": {
                    "targetSourceArtifact": None,
                    "mappedAt": now_ts,
                },
            }

        target_data, source_artifact = self._chembl_index[target_id]
        organism = target_data.get("organism")
        pref_name = target_data.get("pref_name")
        target_type = target_data.get("target_type")
        raw_components = target_data.get("target_components") or []

        # 1. Non-human target handling
        if organism != "Homo sapiens":
            return {
                "chemblTargetId": target_id,
                "prefName": pref_name,
                "targetType": target_type,
                "organism": organism,
                "targetComplexity": "NON_HUMAN",
                "isMultiProtein": len(raw_components) > 1,
                "targetResolutionStatus": "UNRESOLVED",
                "canonicalEnsemblGeneIds": [],
                "components": [
                    {
                        "chemblTargetId": target_id,
                        "chemblComponentId": None,
                        "uniprotId": None,
                        "geneSymbol": None,
                        "componentType": None,
                        "isReviewed": False,
                        "reviewStatus": "NOT_APPLICABLE",
                        "mappingStatus": "UNRESOLVED",
                        "mappingMethod": "NONE",
                        "reason": "NON_HUMAN",
                        "ambiguityReason": None,
                        "ensemblGeneIds": [],
                        "provenance": {
                            "sourceArtifact": source_artifact,
                            "mappedAt": now_ts,
                        },
                    }
                ],
                "provenance": {
                    "targetSourceArtifact": source_artifact,
                    "mappedAt": now_ts,
                },
            }

        # 2. Missing components handling
        if not raw_components:
            return {
                "chemblTargetId": target_id,
                "prefName": pref_name,
                "targetType": target_type,
                "organism": organism,
                "targetComplexity": "SINGLE_PROTEIN",
                "isMultiProtein": False,
                "targetResolutionStatus": "UNRESOLVED",
                "canonicalEnsemblGeneIds": [],
                "components": [
                    {
                        "chemblTargetId": target_id,
                        "chemblComponentId": None,
                        "uniprotId": None,
                        "geneSymbol": None,
                        "componentType": None,
                        "isReviewed": False,
                        "reviewStatus": "NOT_APPLICABLE",
                        "mappingStatus": "UNRESOLVED",
                        "mappingMethod": "CHEMBL_COMPONENT_UNIPROT",
                        "reason": "NO_COMPONENT_ACCESSION",
                        "ambiguityReason": None,
                        "ensemblGeneIds": [],
                        "provenance": {
                            "sourceArtifact": source_artifact,
                            "mappedAt": now_ts,
                        },
                    }
                ],
                "provenance": {
                    "targetSourceArtifact": source_artifact,
                    "mappedAt": now_ts,
                },
            }

        # 3. Classify target complexity
        is_multi_protein = len(raw_components) > 1 or target_type in (
            "PROTEIN COMPLEX",
            "PROTEIN COMPLEX GROUP",
            "PROTEIN FAMILY",
        )
        if target_type == "PROTEIN COMPLEX GROUP":
            target_complexity = "PROTEIN_COMPLEX_GROUP"
        elif target_type == "PROTEIN COMPLEX":
            target_complexity = "PROTEIN_COMPLEX"
        elif target_type == "PROTEIN FAMILY":
            target_complexity = "PROTEIN_FAMILY"
        elif is_multi_protein:
            target_complexity = "MULTI_PROTEIN"
        else:
            target_complexity = "SINGLE_PROTEIN"

        # 4. Resolve each component
        components: List[Dict[str, Any]] = []
        all_canonical_genes: Set[str] = set()

        for comp in raw_components:
            cid = comp.get("component_id")
            accession = comp.get("accession")
            comp_type = comp.get("component_type")

            if not accession:
                components.append({
                    "chemblTargetId": target_id,
                    "chemblComponentId": cid,
                    "uniprotId": None,
                    "geneSymbol": None,
                    "componentType": comp_type,
                    "isReviewed": False,
                    "reviewStatus": "NOT_APPLICABLE",
                    "mappingStatus": "UNRESOLVED",
                    "mappingMethod": "CHEMBL_COMPONENT_UNIPROT",
                    "reason": "NO_COMPONENT_ACCESSION",
                    "ambiguityReason": None,
                    "ensemblGeneIds": [],
                    "provenance": {
                        "sourceArtifact": source_artifact,
                        "mappedAt": now_ts,
                    },
                })
                continue

            # Resolve accession from UniProt cache or fallback
            u_record, u_source = self._uniprot_cache.get(accession, (None, None))
            gene_symbol = None
            is_reviewed = False
            review_status = "NOT_APPLICABLE"
            uniprot_entry_type = None
            ensembl_genes: List[str] = []

            if u_record:
                uniprot_entry_type = u_record.get("entryType")
                if uniprot_entry_type:
                    is_reviewed = "reviewed" in uniprot_entry_type.lower()
                    review_status = "REVIEWED" if is_reviewed else "UNREVIEWED"

                # Extract gene symbol from primary gene entry
                for g in u_record.get("genes", []):
                    gn = g.get("geneName", {}).get("value")
                    if gn:
                        gene_symbol = gn
                        break

                # Extract Ensembl gene IDs from cross references
                for ref in u_record.get("uniProtKBCrossReferences", []):
                    if ref.get("database") == "Ensembl":
                        for prop in ref.get("properties", []):
                            if prop.get("key") == "GeneId" and prop.get("value"):
                                clean_gene_id = prop["value"].split(".")[0].strip()
                                if clean_gene_id:
                                    ensembl_genes.append(clean_gene_id)

                ensembl_genes = sorted(set(ensembl_genes))
            else:
                # Fallback to controlled cache if available
                matched_ctrl = self._get_controlled_component_genes(target_id, cid, accession)
                if matched_ctrl is not None:
                    ensembl_genes = matched_ctrl.get("ensemblGeneIds", [])
                    is_reviewed = True
                    review_status = "REVIEWED"
                    u_source = "controlled_v1"

            # Determine component mapping status
            if not ensembl_genes:
                mapping_status = "UNRESOLVED"
                reason = "NO_EXACT_ENSEMBL_MAPPING"
                ambiguity_reason = None
                mapping_method = "CHEMBL_COMPONENT_UNIPROT"
            elif len(ensembl_genes) == 1:
                mapping_status = "EXACT"
                reason = None
                ambiguity_reason = None
                mapping_method = "CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL"
                all_canonical_genes.update(ensembl_genes)
            else:
                mapping_status = "ONE_TO_MANY"
                reason = None
                ambiguity_reason = "MULTIPLE_GENE_LOCI"
                mapping_method = "CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL"
                all_canonical_genes.update(ensembl_genes)

            # Fallback gene symbol from ChEMBL synonyms if not found in UniProt
            if not gene_symbol:
                for syn in comp.get("target_component_synonyms", []):
                    if syn.get("syn_type") == "GENE_SYMBOL":
                        gene_symbol = syn.get("component_synonym")
                        break

            components.append({
                "chemblTargetId": target_id,
                "chemblComponentId": cid,
                "uniprotId": accession,
                "geneSymbol": gene_symbol,
                "componentType": comp_type,
                "isReviewed": is_reviewed,
                "reviewStatus": review_status,
                "mappingStatus": mapping_status,
                "mappingMethod": mapping_method,
                "reason": reason,
                "ambiguityReason": ambiguity_reason,
                "ensemblGeneIds": ensembl_genes,
                "provenance": {
                    "sourceArtifact": u_source or source_artifact,
                    "uniprotEntryType": uniprot_entry_type,
                    "mappedAt": now_ts,
                },
            })

        # 5. Determine overall target resolution status
        comp_statuses = [c["mappingStatus"] for c in components]
        if all(s in ("EXACT", "ONE_TO_MANY") for s in comp_statuses):
            target_res_status = "RESOLVED"
        elif any(s in ("EXACT", "ONE_TO_MANY") for s in comp_statuses):
            target_res_status = "PARTIALLY_RESOLVED"
        else:
            target_res_status = "UNRESOLVED"

        return {
            "chemblTargetId": target_id,
            "prefName": pref_name,
            "targetType": target_type,
            "organism": organism,
            "targetComplexity": target_complexity,
            "isMultiProtein": is_multi_protein,
            "targetResolutionStatus": target_res_status,
            "canonicalEnsemblGeneIds": sorted(all_canonical_genes),
            "components": components,
            "provenance": {
                "targetSourceArtifact": source_artifact,
                "mappedAt": now_ts,
            },
        }

    def _get_controlled_component_genes(
        self, target_id: str, comp_id: Optional[int], accession: str
    ) -> Optional[Dict[str, Any]]:
        """Helper to match a component against existing controlled crosswalks."""
        entry = self._controlled_cache.get(target_id)
        if not entry:
            return None
        for c in entry.get("components", []):
            if c.get("uniprotId") == accession or (comp_id is not None and c.get("chemblComponentId") == comp_id):
                return c
        return None

    def _enrich_controlled_entry(self, entry: Dict[str, Any], ts: str) -> Dict[str, Any]:
        """Upgrades legacy controlled crosswalk entry to V6 schema."""
        target_id = entry.get("chemblTargetId", "UNKNOWN")
        target_type = entry.get("chemblTargetType")
        organism = entry.get("organism")
        legacy_comps = entry.get("components") or []

        is_multi_protein = len(legacy_comps) > 1 or target_type in (
            "PROTEIN COMPLEX",
            "PROTEIN COMPLEX GROUP",
            "PROTEIN FAMILY",
        )
        if organism != "Homo sapiens":
            complexity = "NON_HUMAN"
        elif target_type == "PROTEIN COMPLEX GROUP":
            complexity = "PROTEIN_COMPLEX_GROUP"
        elif target_type == "PROTEIN COMPLEX":
            complexity = "PROTEIN_COMPLEX"
        elif target_type == "PROTEIN FAMILY":
            complexity = "PROTEIN_FAMILY"
        elif is_multi_protein:
            complexity = "MULTI_PROTEIN"
        else:
            complexity = "SINGLE_PROTEIN"

        v6_comps = []
        all_genes = set()
        for lc in legacy_comps:
            status = lc.get("mappingStatus", "UNRESOLVED")
            genes = lc.get("ensemblGeneIds") or []
            acc = lc.get("uniprotId")
            reason = lc.get("reason")
            ambiguity = "MULTIPLE_GENE_LOCI" if len(genes) > 1 else None
            is_rev = True if acc else False
            all_genes.update(genes)

            v6_comps.append({
                "chemblTargetId": target_id,
                "chemblComponentId": lc.get("chemblComponentId"),
                "uniprotId": acc,
                "geneSymbol": None,
                "componentType": lc.get("componentType", "PROTEIN"),
                "isReviewed": is_rev,
                "reviewStatus": "REVIEWED" if is_rev else "NOT_APPLICABLE",
                "mappingStatus": status,
                "mappingMethod": lc.get("mappingMethod", "CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL"),
                "reason": reason,
                "ambiguityReason": ambiguity,
                "ensemblGeneIds": sorted(genes),
                "provenance": {
                    "sourceArtifact": "controlled_crosswalk_legacy",
                    "mappedAt": ts,
                },
            })

        statuses = [c["mappingStatus"] for c in v6_comps]
        if organism != "Homo sapiens":
            target_status = "UNRESOLVED"
        elif all(s in ("EXACT", "ONE_TO_MANY") for s in statuses):
            target_status = "RESOLVED"
        elif any(s in ("EXACT", "ONE_TO_MANY") for s in statuses):
            target_status = "PARTIALLY_RESOLVED"
        else:
            target_status = "UNRESOLVED"

        return {
            "chemblTargetId": target_id,
            "prefName": None,
            "targetType": target_type,
            "organism": organism,
            "targetComplexity": complexity,
            "isMultiProtein": is_multi_protein,
            "targetResolutionStatus": target_status,
            "canonicalEnsemblGeneIds": sorted(all_genes),
            "components": v6_comps,
            "provenance": {
                "targetSourceArtifact": "controlled_crosswalk_legacy",
                "mappedAt": ts,
            },
        }

    def compute_coverage_statistics(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Computes comprehensive coverage statistics across resolved entries."""
        total_targets = len(entries)
        human_targets = 0
        non_human_targets = 0
        single_protein_targets = 0
        multi_protein_targets = 0

        resolved_targets = 0
        partially_resolved_targets = 0
        unresolved_targets = 0

        total_components = 0
        exact_components = 0
        one_to_many_components = 0
        unresolved_components = 0

        unresolved_non_human = 0
        unresolved_no_ensembl = 0
        unresolved_no_accession = 0

        reviewed_components = 0
        unreviewed_components = 0
        not_applicable_curation = 0

        all_unique_ensembl_genes: Set[str] = set()

        for entry in entries:
            is_human = entry.get("organism") == "Homo sapiens"
            if is_human:
                human_targets += 1
                if entry.get("isMultiProtein"):
                    multi_protein_targets += 1
                else:
                    single_protein_targets += 1
            else:
                non_human_targets += 1

            t_status = entry.get("targetResolutionStatus")
            if t_status == "RESOLVED":
                resolved_targets += 1
            elif t_status == "PARTIALLY_RESOLVED":
                partially_resolved_targets += 1
            else:
                unresolved_targets += 1

            for comp in entry.get("components", []):
                total_components += 1
                c_status = comp.get("mappingStatus")
                if c_status == "EXACT":
                    exact_components += 1
                elif c_status == "ONE_TO_MANY":
                    one_to_many_components += 1
                else:
                    unresolved_components += 1
                    reason = comp.get("reason")
                    if reason == "NON_HUMAN":
                        unresolved_non_human += 1
                    elif reason == "NO_EXACT_ENSEMBL_MAPPING":
                        unresolved_no_ensembl += 1
                    elif reason == "NO_COMPONENT_ACCESSION":
                        unresolved_no_accession += 1

                rev_status = comp.get("reviewStatus")
                if rev_status == "REVIEWED":
                    reviewed_components += 1
                elif rev_status == "UNREVIEWED":
                    unreviewed_components += 1
                else:
                    not_applicable_curation += 1

                for gid in comp.get("ensemblGeneIds", []):
                    all_unique_ensembl_genes.add(gid)

        target_resolution_rate_pct = (
            round((resolved_targets + partially_resolved_targets) / total_targets * 100, 2)
            if total_targets > 0
            else 0.0
        )
        human_resolution_rate_pct = (
            round((resolved_targets + partially_resolved_targets) / human_targets * 100, 2)
            if human_targets > 0
            else 0.0
        )
        exact_component_rate_pct = (
            round(exact_components / total_components * 100, 2)
            if total_components > 0
            else 0.0
        )
        reviewed_rate_pct = (
            round(reviewed_components / (reviewed_components + unreviewed_components) * 100, 2)
            if (reviewed_components + unreviewed_components) > 0
            else 0.0
        )

        return {
            "totalTargets": total_targets,
            "humanTargets": human_targets,
            "nonHumanTargets": non_human_targets,
            "singleProteinTargets": single_protein_targets,
            "multiProteinTargets": multi_protein_targets,
            "targetResolution": {
                "resolved": resolved_targets,
                "partiallyResolved": partially_resolved_targets,
                "unresolved": unresolved_targets,
                "totalUsable": resolved_targets + partially_resolved_targets,
                "resolutionRatePct": target_resolution_rate_pct,
                "humanResolutionRatePct": human_resolution_rate_pct,
            },
            "componentMappings": {
                "totalComponents": total_components,
                "exact": exact_components,
                "oneToMany": one_to_many_components,
                "unresolved": unresolved_components,
                "exactMappingRatePct": exact_component_rate_pct,
            },
            "unresolvedBreakdown": {
                "nonHuman": unresolved_non_human,
                "noEnsemblMapping": unresolved_no_ensembl,
                "noAccession": unresolved_no_accession,
            },
            "curationStatus": {
                "reviewedSwissProt": reviewed_components,
                "unreviewedTrEMBL": unreviewed_components,
                "notApplicable": not_applicable_curation,
                "reviewedRatePct": reviewed_rate_pct,
            },
            "uniqueEnsemblGenes": len(all_unique_ensembl_genes),
            "uniqueEnsemblGeneList": sorted(all_unique_ensembl_genes),
        }

    def build_crosswalk(self, target_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """Builds a complete, reproducible target crosswalk snapshot with coverage statistics."""
        self.index_sources()
        if target_ids is None:
            target_ids = self.get_available_target_ids()

        entries = [self.resolve_target(tid) for tid in target_ids]
        stats = self.compute_coverage_statistics(entries)

        source_artifacts_summary = {
            "chemblTargets": (
                str(self.targets_json_path.relative_to(self.artifacts_dir))
                if self.targets_json_path.is_relative_to(self.artifacts_dir)
                else str(self.targets_json_path)
            ),
            "uniprotCacheDirs": [
                str(p.relative_to(self.artifacts_dir) if p.is_relative_to(self.artifacts_dir) else p)
                for p in self.uniprot_cache_dirs
            ],
            "chemblCacheDirs": [
                str(p.relative_to(self.artifacts_dir) if p.is_relative_to(self.artifacts_dir) else p)
                for p in self.chembl_cache_dirs
            ],
            "controlledCrosswalks": [
                str(p.relative_to(self.artifacts_dir) if p.is_relative_to(self.artifacts_dir) else p)
                for p in self.controlled_crosswalk_paths
            ],
        }

        return {
            "version": "chembl-uniprot-ensembl-v6-phase1",
            "generationTimestamp": datetime.now(timezone.utc).isoformat(),
            "sourceArtifacts": source_artifacts_summary,
            "targetCount": len(entries),
            "coverageStatistics": stats,
            "entries": entries,
        }

    def save_snapshot(self, snapshot: Dict[str, Any], output_dir: Path) -> Tuple[Path, Path]:
        """Saves both the complete target crosswalk and separate coverage statistics report."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        crosswalk_file = output_dir / "target_crosswalk.json"
        with open(crosswalk_file, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2)

        stats_file = output_dir / "coverage_statistics.json"
        stats_payload = {
            "version": snapshot.get("version"),
            "generationTimestamp": snapshot.get("generationTimestamp"),
            "targetCount": snapshot.get("targetCount"),
            "coverageStatistics": snapshot.get("coverageStatistics"),
        }
        with open(stats_file, "w", encoding="utf-8") as f:
            json.dump(stats_payload, f, indent=2)

        return crosswalk_file, stats_file
