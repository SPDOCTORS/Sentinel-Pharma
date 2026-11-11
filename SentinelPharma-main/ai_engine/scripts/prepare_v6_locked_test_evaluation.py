"""SentinelPharma V6 Locked Test Evaluation Preparation Runner.

Executes:
1. Deep split, ontology grouping, and negative filtering audits.
2. Verification of frozen graph and checkpoint checksums.
3. Generation of locked_test_evaluation_manifest.json.
4. Pre-generation of locked candidate pools for test queries (without running evaluation).
"""
import json
import sys
from pathlib import Path

# Ensure package imports work
ai_engine_root = Path(__file__).resolve().parents[1]
if str(ai_engine_root) not in sys.path:
    sys.path.insert(0, str(ai_engine_root))

from app.services.gnn.v6_locked_test_service import (
    LOCKED_TEST_SPEC_DIR,
    build_locked_manifest,
)
from app.services.gnn.v6_hard_negative_eval import V6HardCandidatePoolGenerator
from app.services.gnn.v6_experimentation import (
    DEFAULT_EXPERIMENT_DIR,
    DEFAULT_FROZEN_DIR,
    DEFAULT_OPEN_TARGETS_DIR,
    normalize_disease_canonical,
)
import pyarrow.parquet as pq
from collections import Counter, defaultdict


def main():
    print("=== SentinelPharma V6: Preparing Locked Final Test Evaluation ===")

    # 1. Build and save the locked evaluation manifest
    manifest = build_locked_manifest()
    manifest_path = LOCKED_TEST_SPEC_DIR / "locked_test_evaluation_manifest.json"
    print(f"Locked Manifest saved to: {manifest_path}")

    # 2. Build the locked test candidate pools (deterministic generation, zero evaluation)
    test_pool_file = LOCKED_TEST_SPEC_DIR / "locked_test_candidate_pool.json"
    if not test_pool_file.exists():
        print("Building locked test candidate pool file...")
        with open(DEFAULT_EXPERIMENT_DIR / "splits.json", "r", encoding="utf-8") as f:
            splits = json.load(f)
        with open(DEFAULT_FROZEN_DIR / "graph.json", "r", encoding="utf-8") as f:
            graph = json.load(f)

        dis_parquet = DEFAULT_OPEN_TARGETS_DIR / "disease.parquet"
        table = pq.read_table(dis_parquet, columns=["id", "ancestors", "descendants", "therapeuticAreas"])
        anc_map = defaultdict(set)
        desc_map = defaultdict(set)
        ta_map = defaultdict(set)
        for did, ancs, descs, tas in zip(
            table["id"].to_pylist(),
            table["ancestors"].to_pylist(),
            table["descendants"].to_pylist(),
            table["therapeuticAreas"].to_pylist(),
        ):
            cid = normalize_disease_canonical(did)
            for a in (ancs or []):
                anc_map[cid].add(normalize_disease_canonical(a))
            for d in (descs or []):
                desc_map[cid].add(normalize_disease_canonical(d))
            for t in (tas or []):
                ta_map[cid].add(normalize_disease_canonical(t))

        train_disease_counts = Counter(p["disease"] for p in splits["train"])
        all_indications = splits["train"] + splits["val"] + splits["test"]

        generator = V6HardCandidatePoolGenerator(
            all_diseases=[e["canonicalId"] for e in graph["entities"] if e.get("entityType", "").lower() == "disease"],
            all_indications=all_indications,
            disease_ancestors=anc_map,
            disease_descendants=desc_map,
            disease_therapeutic_areas=ta_map,
            train_disease_frequencies=dict(train_disease_counts),
            negatives_per_query=99,
            seed=42,
        )

        test_pools = generator.generate_pools(splits["test"])
        pool_doc = {
            "poolVersion": "v6-locked-test-candidate-pool-v1",
            "queryCount": len(test_pools),
            "negativesPerQuery": 99,
            "candidatePoolSize": 100,
            "difficultyConditioning": "splits.train frequencies strictly",
            "testQueries": test_pools,
        }
        with open(test_pool_file, "w", encoding="utf-8") as f:
            json.dump(pool_doc, f, indent=2)
        print(f"Locked test candidate pools saved to: {test_pool_file} (N={len(test_pools)})")
    else:
        print(f"Locked test candidate pools already exist at: {test_pool_file}")

    print("\nAudits and Manifest completed successfully.")
    print("Test set remains UN-EVALUATED and ready for execution upon user authorization.")


if __name__ == "__main__":
    main()
