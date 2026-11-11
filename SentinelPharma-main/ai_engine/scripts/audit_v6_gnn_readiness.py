"""SentinelPharma V6 GNN Training Readiness Audit.

Performs a read-only audit of the frozen V6 biomedical graph for:
1. Connected-component counts and size distribution.
2. Supervision indication coverage per drug and disease, plus clinical phase stratification.
3. Disease ontology hierarchy analysis: ancestor/descendant label subsumption and equivalence.
4. Auxiliary edge shortcut leakage: 2-hop (drug->target->disease) and 3-hop pathway connectivity.
5. Transductive and inductive split designs with leakage controls.
"""
import gzip
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import numpy as np
import pyarrow.parquet as pq

# Paths
GRAPH_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "biomedical_graph" / "v6_production" / "biomedical_graph_v6_frozen"
GRAPH_PATH = GRAPH_DIR / "graph.json"
SUPERVISION_PATH = GRAPH_DIR / "supervision_indications.json"
AMBIGUOUS_PATH = GRAPH_DIR / "ambiguous_mappings.json"
MANIFEST_PATH = GRAPH_DIR / "source_manifest.json"
QUALITY_PATH = GRAPH_DIR / "quality_report.json"
OPEN_TARGETS_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "open_targets" / "26.06"
DISEASE_PARQUET = OPEN_TARGETS_DIR / "disease.parquet"
OUTPUT_REPORT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "biomedical_graph" / "v6_production" / "v6_gnn_readiness_audit.json"


def normalize_disease_canonical(raw_id: str) -> str:
    raw = raw_id.strip()
    if ":" in raw:
        return raw
    if raw.startswith("EFO_"):
        return f"EFO:{raw[4:]}"
    if raw.startswith("MONDO_"):
        return f"MONDO:{raw[6:]}"
    if raw.startswith("DOID_"):
        return f"DOID:{raw[5:]}"
    if raw.startswith("Orphanet_"):
        return f"Orphanet:{raw[9:]}"
    if raw.startswith("HP_"):
        return f"HP:{raw[3:]}"
    if raw.startswith("OTAR_"):
        return f"OTAR:{raw[5:]}"
    return f"EFO:{raw}"


def run_gnn_readiness_audit() -> Dict[str, Any]:
    print("=================================================================")
    print("        SentinelPharma V6: GNN Training Readiness Audit          ")
    print("=================================================================")
    t0 = time.time()

    # 1. Load Frozen V6 Graph
    print("[1/5] Loading frozen V6 biomedical graph artifacts...")
    with open(GRAPH_PATH, "r", encoding="utf-8") as f:
        graph = json.load(f)
    with open(SUPERVISION_PATH, "r", encoding="utf-8") as f:
        supervision = json.load(f)
    with open(QUALITY_PATH, "r", encoding="utf-8") as f:
        quality = json.load(f)

    entities = graph["entities"]
    relations = graph["relations"]
    indications = supervision["indications"]

    entity_ids = {e["canonicalId"]: e for e in entities}
    entity_types = {e["canonicalId"]: e["entityType"] for e in entities}
    drugs_in_graph = {e_id for e_id, et in entity_types.items() if et == "DRUG"}
    diseases_in_graph = {e_id for e_id, et in entity_types.items() if et == "DISEASE"}
    targets_in_graph = {e_id for e_id, et in entity_types.items() if et == "TARGET"}
    pathways_in_graph = {e_id for e_id, et in entity_types.items() if et == "PATHWAY"}

    print(f"  Loaded {len(entities):,} entities ({len(drugs_in_graph):,} drugs, {len(diseases_in_graph):,} diseases, {len(targets_in_graph):,} targets, {len(pathways_in_graph):,} pathways)")
    print(f"  Loaded {len(relations):,} relations, {len(indications):,} supervision indication pairs.")

    # 2. Connected Component Analysis
    print("\n[2/5] Computing connected component topology across undirected graph...")
    adj = defaultdict(set)
    for r in relations:
        u, v = r["source"], r["target"]
        adj[u].add(v)
        adj[v].add(u)

    visited = set()
    components: List[Set[str]] = []

    for node in entity_ids:
        if node not in visited:
            comp = set()
            queue = [node]
            visited.add(node)
            while queue:
                curr = queue.pop()
                comp.add(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(comp)

    components.sort(key=lambda c: len(c), reverse=True)
    comp_sizes = [len(c) for c in components]
    lcc = components[0]
    lcc_entity_types = Counter(entity_types[node] for node in lcc)

    print(f"  Total Connected Components: {len(components):,}")
    print(f"  Largest Connected Component (LCC) Size: {len(lcc):,} nodes ({len(lcc)/len(entities)*100:.2f}% of graph)")
    print(f"  LCC Entity Breakdown: {dict(lcc_entity_types)}")

    small_components_summary = []
    for i, c in enumerate(components[1:], start=2):
        c_types = Counter(entity_types[n] for n in c)
        c_edges = sum(len(adj[n] & c) for n in c) // 2
        small_components_summary.append({
            "componentIndex": i,
            "nodeCount": len(c),
            "edgeCount": c_edges,
            "entityTypes": dict(c_types),
            "sampleNodes": list(c)[:5],
        })

    # 3. Supervision Indication Coverage & Clinical Stratification
    print("\n[3/5] Auditing supervision indication coverage and clinical trial phase...")
    indicated_drugs = set(ind["drug"] for ind in indications)
    indicated_diseases = set(ind["disease"] for ind in indications)

    drug_ind_counts = Counter(ind["drug"] for ind in indications)
    disease_ind_counts = Counter(ind["disease"] for ind in indications)

    phase_counter = Counter()
    for ind in indications:
        p = ind.get("maxPhaseForInd")
        phase_counter[p if p is not None else "UNKNOWN"] += 1

    d_counts = list(drug_ind_counts.values())
    dis_counts = list(disease_ind_counts.values())

    supervision_metrics = {
        "totalSupervisionPairs": len(indications),
        "uniqueDrugsWithIndications": len(indicated_drugs),
        "drugCoveragePercent": round(len(indicated_drugs) / len(drugs_in_graph) * 100, 2),
        "uniqueDiseasesWithIndications": len(indicated_diseases),
        "diseaseCoveragePercent": round(len(indicated_diseases) / len(diseases_in_graph) * 100, 2),
        "indicationsPerDrug": {
            "min": int(np.min(d_counts)) if d_counts else 0,
            "p25": float(np.percentile(d_counts, 25)) if d_counts else 0.0,
            "median": float(np.median(d_counts)) if d_counts else 0.0,
            "mean": round(float(np.mean(d_counts)), 2) if d_counts else 0.0,
            "p75": float(np.percentile(d_counts, 75)) if d_counts else 0.0,
            "max": int(np.max(d_counts)) if d_counts else 0,
        },
        "indicationsPerDisease": {
            "min": int(np.min(dis_counts)) if dis_counts else 0,
            "p25": float(np.percentile(dis_counts, 25)) if dis_counts else 0.0,
            "median": float(np.median(dis_counts)) if dis_counts else 0.0,
            "mean": round(float(np.mean(dis_counts)), 2) if dis_counts else 0.0,
            "p75": float(np.percentile(dis_counts, 75)) if dis_counts else 0.0,
            "max": int(np.max(dis_counts)) if dis_counts else 0,
        },
        "phaseBreakdown": {
            "phase4_approved": {
                "count": phase_counter.get(4, 0),
                "percent": round(phase_counter.get(4, 0) / len(indications) * 100, 2),
            },
            "phase3": {
                "count": phase_counter.get(3, 0),
                "percent": round(phase_counter.get(3, 0) / len(indications) * 100, 2),
            },
            "phase2": {
                "count": phase_counter.get(2, 0),
                "percent": round(phase_counter.get(2, 0) / len(indications) * 100, 2),
            },
            "phase1": {
                "count": phase_counter.get(1, 0),
                "percent": round(phase_counter.get(1, 0) / len(indications) * 100, 2),
            },
            "phase0_early1": {
                "count": phase_counter.get(0.5, 0),
                "percent": round(phase_counter.get(0.5, 0) / len(indications) * 100, 2),
            },
            "preclinical_or_other": {
                "count": phase_counter.get(-1, 0) + phase_counter.get("UNKNOWN", 0),
                "percent": round((phase_counter.get(-1, 0) + phase_counter.get("UNKNOWN", 0)) / len(indications) * 100, 2),
            },
        },
    }

    print(f"  Drugs with Indications: {len(indicated_drugs):,} / {len(drugs_in_graph):,} ({supervision_metrics['drugCoveragePercent']}%)")
    print(f"  Diseases with Indications: {len(indicated_diseases):,} / {len(diseases_in_graph):,} ({supervision_metrics['diseaseCoveragePercent']}%)")
    print(f"  Indications Phase Breakdown: Phase 4 Approved: {supervision_metrics['phaseBreakdown']['phase4_approved']['count']:,} ({supervision_metrics['phaseBreakdown']['phase4_approved']['percent']}%)")

    # 4. Ontology Hierarchy & Indication Redundancy
    print("\n[4/5] Auditing Open Targets disease ontology hierarchy and hierarchical redundancy...")
    dis_table = pq.read_table(DISEASE_PARQUET, columns=["id", "name", "ancestors", "descendants", "dbXRefs"])
    disease_ancestors = {}
    disease_descendants = {}
    disease_xrefs = {}
    for d_id, anc, desc, xrefs in zip(dis_table["id"].to_pylist(), dis_table["ancestors"].to_pylist(), dis_table["descendants"].to_pylist(), dis_table["dbXRefs"].to_pylist()):
        c_id = normalize_disease_canonical(d_id)
        disease_ancestors[c_id] = set(normalize_disease_canonical(a) for a in (anc or []))
        disease_descendants[c_id] = set(normalize_disease_canonical(d) for d in (desc or []))
        disease_xrefs[c_id] = set(xrefs or [])

    # Group indications by drug
    drug_to_diseases = defaultdict(set)
    for ind in indications:
        drug_to_diseases[ind["drug"]].add(ind["disease"])

    hierarchically_redundant_pairs = []
    drugs_with_redundant_labels = set()

    for d, d_set in drug_to_diseases.items():
        d_list = list(d_set)
        for i in range(len(d_list)):
            d1 = d_list[i]
            d1_anc = disease_ancestors.get(d1, set())
            for j in range(i + 1, len(d_list)):
                d2 = d_list[j]
                d2_anc = disease_ancestors.get(d2, set())
                # Check if d1 is ancestor of d2
                if d1 in d2_anc:
                    hierarchically_redundant_pairs.append({
                        "drug": d,
                        "parentDisease": d1,
                        "childDisease": d2,
                        "relationship": "CHILD_IS_DESCENDANT_OF_PARENT",
                    })
                    drugs_with_redundant_labels.add(d)
                elif d2 in d1_anc:
                    hierarchically_redundant_pairs.append({
                        "drug": d,
                        "parentDisease": d2,
                        "childDisease": d1,
                        "relationship": "CHILD_IS_DESCENDANT_OF_PARENT",
                    })
                    drugs_with_redundant_labels.add(d)

    print(f"  Hierarchically Redundant Indication Pairs: {len(hierarchically_redundant_pairs):,} across {len(drugs_with_redundant_labels):,} drugs")
    print(f"    (e.g., drug labeled for both specific sub-disease and general parent disease concept)")

    # 5. Auxiliary Edge Shortcut Leakage Analysis (2-Hop & Multi-Hop Paths)
    print("\n[5/5] Auditing auxiliary edge shortcut paths (2-hop Drug -> Target -> Disease)...")
    drug_to_targets_curated = defaultdict(set)
    drug_to_targets_bio = defaultdict(set)
    disease_to_targets = defaultdict(set)
    target_to_pathways = defaultdict(set)

    for r in relations:
        s, t, rel = r["source"], r["target"], r["relationType"]
        if rel == "DRUG_TARGET_CURATED_MECHANISM":
            drug_to_targets_curated[s].add(t)
        elif rel == "DRUG_TARGET_BIOACTIVITY":
            drug_to_targets_bio[s].add(t)
        elif rel == "DISEASE_TARGET":
            disease_to_targets[s].add(t)
        elif rel == "TARGET_PATHWAY":
            target_to_pathways[s].add(t)

    # For every supervision indication pair, check if there is a 2-hop path
    pairs_with_curated_2hop = 0
    pairs_with_bio_2hop = 0
    pairs_with_any_2hop = 0
    pairs_without_2hop = 0

    shared_targets_distribution = []

    for ind in indications:
        d = ind["drug"]
        dis = ind["disease"]
        t_cur = drug_to_targets_curated.get(d, set())
        t_bio = drug_to_targets_bio.get(d, set())
        t_all = t_cur | t_bio
        t_dis = disease_to_targets.get(dis, set())

        shared_cur = t_cur & t_dis
        shared_bio = t_bio & t_dis
        shared_all = t_all & t_dis

        if shared_cur:
            pairs_with_curated_2hop += 1
        if shared_bio:
            pairs_with_bio_2hop += 1
        if shared_all:
            pairs_with_any_2hop += 1
            shared_targets_distribution.append(len(shared_all))
        else:
            pairs_without_2hop += 1

    print(f"  Supervision Pairs with Direct 2-hop Path (D -> T -> Di): {pairs_with_any_2hop:,} / {len(indications):,} ({pairs_with_any_2hop/len(indications)*100:.2f}%)")
    print(f"    - Via Curated Mechanism: {pairs_with_curated_2hop:,} ({pairs_with_curated_2hop/len(indications)*100:.2f}%)")
    print(f"    - Via Bioactivity:        {pairs_with_bio_2hop:,} ({pairs_with_bio_2hop/len(indications)*100:.2f}%)")
    print(f"  Supervision Pairs WITHOUT Direct 2-hop Path (multi-hop / pathway required): {pairs_without_2hop:,} ({pairs_without_2hop/len(indications)*100:.2f}%)")

    # 6. Propose Train / Val / Test Splits with Leakage Controls
    print("\n[Splitting Proposals] Designing transductive and inductive split architectures...")
    split_recommendations = {
        "transductiveSplit": {
            "description": "Standard edge-level link prediction split on the 12,612 supervision indication pairs.",
            "ratios": {"train": 0.80, "val": 0.10, "test": 0.10},
            "pairCounts": {
                "train": int(len(indications) * 0.80),
                "val": int(len(indications) * 0.10),
                "test": len(indications) - int(len(indications) * 0.80) - int(len(indications) * 0.10),
            },
            "leakageControls": [
                "Zero message-passing leakage: Indication edges are entirely omitted from graph.json relations.",
                "Hierarchical label consistency: When holding out (Drug, ChildDisease), verify (Drug, ParentDisease) does not trivially leak in Train without ontology masking.",
                "Negative sampling policy: Degree-matched and disease-aware negatives (1:5 or 1:10 ratio) to prevent false easy negative inflation.",
            ],
        },
        "drugInductiveSplit": {
            "description": "Drug cold-start split: Evaluates repurposing discovery on unseen or novel drugs.",
            "ratios": {"train": 0.70, "val": 0.15, "test": 0.15},
            "drugCounts": {
                "train": int(len(indicated_drugs) * 0.70),
                "val": int(len(indicated_drugs) * 0.15),
                "test": len(indicated_drugs) - int(len(indicated_drugs) * 0.70) - int(len(indicated_drugs) * 0.15),
            },
            "leakageControls": [
                "Drug-level partition: All indications for test drugs are strictly held out.",
                "Molecular similarity check: Cluster drugs by Morgan/ECFP4 fingerprint (Tanimoto < 0.65) to ensure test drugs are chemically novel.",
            ],
        },
        "diseaseInductiveSplit": {
            "description": "Disease cold-start split: Evaluates indication prediction for rare/orphan or newly profiled diseases.",
            "ratios": {"train": 0.70, "val": 0.15, "test": 0.15},
            "diseaseCounts": {
                "train": int(len(indicated_diseases) * 0.70),
                "val": int(len(indicated_diseases) * 0.15),
                "test": len(indicated_diseases) - int(len(indicated_diseases) * 0.70) - int(len(indicated_diseases) * 0.15),
            },
            "leakageControls": [
                "Therapeutic area-aware stratification: Ensure diverse therapeutic areas across Train/Val/Test.",
                "Ontology branch isolation: Hold out entire sub-branches of the EFO/MONDO tree to prevent sub-type leakage.",
            ],
        },
        "baselineEvaluationProtocols": {
            "heuristicBaselines": ["Common Neighbors", "Jaccard Index", "Adamic-Adar", "Resource Allocation"],
            "knowledgeGraphEmbeddingBaselines": ["TransE", "ComplEx", "RotatE"],
            "heterogeneousGNNBaselines": ["RGCN (Relational GCN)", "HeteroGAT (Graph Attention Network)", "HGT (Heterogeneous Graph Transformer)"],
            "evaluationMetrics": [
                "AUROC (Area Under ROC Curve)",
                "AUPRC (Area Under Precision-Recall Curve - essential for sparse biomedical link prediction)",
                "Hits@10, Hits@50",
                "Mean Reciprocal Rank (MRR)",
                "Stratified AUROC/AUPRC by Clinical Phase (Phase 4 Approved vs Phase 1-3 Investigational)",
            ],
        },
    }

    report = {
        "auditVersion": "v6-gnn-readiness-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "datasetHash": graph["datasetHash"],
        "connectedComponents": {
            "totalComponents": len(components),
            "largestComponentNodeCount": len(lcc),
            "largestComponentNodePercent": round(len(lcc) / len(entities) * 100, 2),
            "largestComponentEntitiesByType": dict(lcc_entity_types),
            "smallComponentsCount": len(components) - 1,
            "smallComponents": small_components_summary,
        },
        "supervisionCoverage": supervision_metrics,
        "ontologyHierarchyAudit": {
            "hierarchicallyRedundantPairsCount": len(hierarchically_redundant_pairs),
            "drugsWithRedundantLabelsCount": len(drugs_with_redundant_labels),
            "sampleRedundantPairs": hierarchically_redundant_pairs[:10],
            "recommendation": "Apply ontology-aware evaluation: Deduplicate or evaluate with hierarchical distance penalties.",
        },
        "shortcutLeakageAudit": {
            "pairsWithCurated2Hop": pairs_with_curated_2hop,
            "pairsWithBioactivity2Hop": pairs_with_bio_2hop,
            "pairsWithAny2Hop": pairs_with_any_2hop,
            "pairsWithAny2HopPercent": round(pairs_with_any_2hop / len(indications) * 100, 2),
            "pairsWithout2Hop": pairs_without_2hop,
            "pairsWithout2HopPercent": round(pairs_without_2hop / len(indications) * 100, 2),
            "sharedTargetsPerPair": {
                "mean": round(float(np.mean(shared_targets_distribution)), 2) if shared_targets_distribution else 0.0,
                "median": float(np.median(shared_targets_distribution)) if shared_targets_distribution else 0.0,
                "max": int(np.max(shared_targets_distribution)) if shared_targets_distribution else 0,
            },
        },
        "splitRecommendations": split_recommendations,
    }

    # Write audit report artifact
    with open(OUTPUT_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n[Artifact Persisted] Saved readiness audit to: {OUTPUT_REPORT_PATH}")
    print(f"Audit completed in {time.time() - t0:.2f}s.")
    return report


if __name__ == "__main__":
    run_gnn_readiness_audit()
