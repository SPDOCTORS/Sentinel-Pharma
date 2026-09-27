"""Provenance-controlled biomedical graph builder; never invents entities or relations."""
from __future__ import annotations

import argparse, hashlib, json, time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import httpx
from app.services.gnn.open_targets_release import RELEASE as OPEN_TARGETS_RELEASE, DATASETS as OPEN_TARGETS_DATASETS, read_complete_direct_associations, read_direct_associations
from app.services.gnn.reactome_release import RELEASE as REACTOME_RELEASE, ReactomeArtifactError, load_frozen_reactome, read_target_ids, sha256_file
from app.services.gnn.target_crosswalk import expand_crosswalk, load_crosswalk

ENTITY_TYPES = {"DRUG", "DISEASE", "TARGET", "PATHWAY"}
RELATION_TYPES = {"DRUG_TARGET", "DISEASE_TARGET", "DRUG_INDICATION", "TARGET_PATHWAY"}

def now() -> str: return datetime.now(timezone.utc).isoformat()
def entity(canonical_id: str, entity_type: str, name: str, source: str, aliases: Optional[List[str]] = None) -> Dict[str, Any]:
    if entity_type not in ENTITY_TYPES or not canonical_id or not name: raise ValueError("Malformed entity")
    return {"canonicalId": canonical_id, "entityType": entity_type, "name": name, "aliases": aliases or [], "sourceIds": {source: canonical_id}, "provenance": [{"source": source, "retrievedAt": now()}]}
def relation(source: str, target: str, relation_type: str, provider: str, source_record_id: str, metadata: Optional[Dict[str,Any]] = None, evidence_level: str = "CURATED_SOURCE") -> Dict[str,Any]:
    if relation_type not in RELATION_TYPES or not source or not target or not source_record_id: raise ValueError("Malformed relation")
    return {"source": source, "target": target, "relationType": relation_type, "provenance": [{"source": provider, "sourceRecordId": source_record_id, "retrievedAt": now(), "evidenceLevel": evidence_level, "metadata": metadata or {}}]}

class ChEMBLAdapter:
    base_url = "https://www.ebi.ac.uk/chembl/api/data"
    def __init__(self, client: Optional[httpx.Client] = None, cache_dir: Optional[Path] = None):
        self.client, self.cache_dir = client, cache_dir; self.stats=Counter()
    def _get(self, path: str, params: Dict[str,Any]) -> Dict[str,Any]:
        if not self.client: raise RuntimeError("ChEMBL adapter requires an HTTP client")
        key=hashlib.sha256(json.dumps({'path':path,'params':params},sort_keys=True).encode()).hexdigest(); cache=(self.cache_dir / f'{key}.json') if self.cache_dir else None
        if cache and cache.exists():
            try:
                data=json.loads(cache.read_text())
                if isinstance(data,dict): self.stats['cacheHits']+=1; return data
            except json.JSONDecodeError: cache.unlink()
        self.stats['cacheMisses']+=1
        data=None
        for attempt in range(3):
            try:
                response = self.client.get(f"{self.base_url}/{path}.json", params=params)
                status=getattr(response,'status_code',200)
                if status == 429 or status >= 500: raise httpx.HTTPStatusError('transient',request=getattr(response,'request',None),response=response)
                response.raise_for_status(); data=response.json(); break
            except (httpx.TimeoutException,httpx.ConnectError,httpx.HTTPStatusError):
                self.stats['retries']+=1
                if attempt == 2: raise RuntimeError(f'ChEMBL source unavailable: {path}')
                time.sleep(.25*(attempt+1))
        if not isinstance(data, dict): raise ValueError("Malformed ChEMBL response")
        if cache: cache.parent.mkdir(parents=True,exist_ok=True); cache.write_text(json.dumps(data)); self.stats['successfulResponses']+=1
        return data
    def collect(self, max_drugs: int) -> tuple[List[Dict[str,Any]], List[Dict[str,Any]]]:
        # Stable source-backed development selection: approved (phase 4) molecules
        # ordered by immutable ChEMBL identifier. This never uses graph outcomes.
        molecules = self._get("molecule", {"max_phase": 4, "limit": max_drugs, "order_by": "molecule_chembl_id"}).get("molecules")
        if not isinstance(molecules, list): raise ValueError("Malformed ChEMBL molecule list")
        entities, relations = [], []
        for molecule in molecules:
            chembl_id, name = molecule.get("molecule_chembl_id"), molecule.get("pref_name")
            if not chembl_id or not name: continue
            drug = f"CHEMBL:{chembl_id}"; entities.append(entity(drug, "DRUG", name, "ChEMBL"))
            mechanisms = self._get("mechanism", {"molecule_chembl_id": chembl_id, "limit": 100}).get("mechanisms", [])
            if not isinstance(mechanisms, list): raise ValueError("Malformed ChEMBL mechanism list")
            for mechanism in mechanisms:
                target_id, target_name = mechanism.get("target_chembl_id"), mechanism.get("target_pref_name")
                if target_id and not target_name:
                    target_payload = self._get(f"target/{target_id}", {})
                    target_name = target_payload.get("pref_name")
                if not target_id or not target_name: continue
                target = f"CHEMBL_TARGET:{target_id}"; entities.append(entity(target, "TARGET", target_name, "ChEMBL"))
                relations.append(relation(drug, target, "DRUG_TARGET", "ChEMBL", mechanism.get("mechanism_id", f"{chembl_id}:{target_id}"), {"actionType": mechanism.get("action_type")}))
            indications = self._get("drug_indication", {"molecule_chembl_id": chembl_id, "limit": 100}).get("drug_indications", [])
            if not isinstance(indications, list): raise ValueError("Malformed ChEMBL indication list")
            for indication in indications:
                disease_id = indication.get("efo_id") or indication.get("mesh_id")
                disease_name = indication.get("efo_term") or indication.get("mesh_heading")
                if not disease_id or not disease_name: continue
                # Preserve provider namespaces.  ChEMBL may return EFO, MONDO, or HP
                # IDs through this field; inventing an EFO prefix would corrupt them.
                raw_disease_id = str(disease_id)
                disease = raw_disease_id if indication.get("efo_id") and ":" in raw_disease_id else f"{'EFO' if indication.get('efo_id') else 'MESH'}:{raw_disease_id}"
                entities.append(entity(disease, "DISEASE", disease_name, "ChEMBL"))
                relations.append(relation(drug, disease, "DRUG_INDICATION", "ChEMBL", indication.get("drugind_id", f"{chembl_id}:{disease_id}"), {"maxPhaseForInd": indication.get("max_phase_for_ind")}, "CURATED_INDICATION"))
        return entities, relations


class FrozenChEMBLAdapter:
    """Offline adapter for an immutable, provenance-controlled ChEMBL subset."""

    def __init__(self, source_dir: Path):
        self.source_dir = Path(source_dir)

    def _load(self, filename: str) -> Any:
        path = self.source_dir / filename
        if not path.is_file():
            raise FileNotFoundError(f"Frozen ChEMBL artifact missing: {path}")
        try:
            return json.loads(path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Malformed frozen ChEMBL artifact: {path}") from exc

    def collect(self, max_drugs: int) -> tuple[List[Dict[str,Any]], List[Dict[str,Any]]]:
        molecule_payload = self._load("molecules.json")
        mechanisms = self._load("mechanisms.json")
        indications = self._load("indications.json")
        targets = self._load("targets.json")

        if not isinstance(molecule_payload, dict):
            raise ValueError("Malformed frozen ChEMBL molecule payload")

        molecules = molecule_payload.get("molecules")
        if not isinstance(molecules, list):
            raise ValueError("Malformed frozen ChEMBL molecule list")
        if not isinstance(mechanisms, list):
            raise ValueError("Malformed frozen ChEMBL mechanism list")
        if not isinstance(indications, list):
            raise ValueError("Malformed frozen ChEMBL indication list")
        if not isinstance(targets, list):
            raise ValueError("Malformed frozen ChEMBL target list")

        if max_drugs > len(molecules):
            raise ValueError(
                f"Frozen ChEMBL subset contains only {len(molecules)} drugs; "
                f"requested {max_drugs}"
            )

        molecules = molecules[:max_drugs]
        selected_ids = {
            molecule.get("molecule_chembl_id")
            for molecule in molecules
            if molecule.get("molecule_chembl_id")
        }

        mechanisms_by_drug: Dict[str,List[Dict[str,Any]]] = {}
        for item in mechanisms:
            molecule_id = item.get("molecule_chembl_id")
            mechanisms_by_drug.setdefault(molecule_id, []).append(item)

        indications_by_drug: Dict[str,List[Dict[str,Any]]] = {}
        for item in indications:
            molecule_id = item.get("molecule_chembl_id")
            indications_by_drug.setdefault(molecule_id, []).append(item)

        target_by_id = {
            item.get("target_chembl_id"): item
            for item in targets
            if item.get("target_chembl_id")
        }

        entities, relations = [], []

        for molecule in molecules:
            chembl_id = molecule.get("molecule_chembl_id")
            name = molecule.get("pref_name")
            if not chembl_id or not name:
                continue

            drug = f"CHEMBL:{chembl_id}"
            entities.append(entity(drug, "DRUG", name, "ChEMBL"))

            for mechanism in mechanisms_by_drug.get(chembl_id, []):
                target_id = mechanism.get("target_chembl_id")
                target_name = mechanism.get("target_pref_name")

                if target_id and not target_name:
                    target_payload = target_by_id.get(target_id)
                    if target_payload:
                        target_name = target_payload.get("pref_name")

                if not target_id or not target_name:
                    continue

                target = f"CHEMBL_TARGET:{target_id}"
                entities.append(entity(target, "TARGET", target_name, "ChEMBL"))
                relations.append(
                    relation(
                        drug,
                        target,
                        "DRUG_TARGET",
                        "ChEMBL",
                        mechanism.get("mechanism_id", f"{chembl_id}:{target_id}"),
                        {"actionType": mechanism.get("action_type")},
                    )
                )

            for indication in indications_by_drug.get(chembl_id, []):
                disease_id = indication.get("efo_id") or indication.get("mesh_id")
                disease_name = indication.get("efo_term") or indication.get("mesh_heading")

                if not disease_id or not disease_name:
                    continue

                raw_disease_id = str(disease_id)
                disease = (
                    raw_disease_id
                    if indication.get("efo_id") and ":" in raw_disease_id
                    else f"{'EFO' if indication.get('efo_id') else 'MESH'}:{raw_disease_id}"
                )

                entities.append(entity(disease, "DISEASE", disease_name, "ChEMBL"))
                relations.append(
                    relation(
                        drug,
                        disease,
                        "DRUG_INDICATION",
                        "ChEMBL",
                        indication.get("drugind_id", f"{chembl_id}:{disease_id}"),
                        {"maxPhaseForInd": indication.get("max_phase_for_ind")},
                        "CURATED_INDICATION",
                    )
                )

        return entities, relations

class OpenTargetsAdapter:
    """Small development-mode GraphQL adapter; scores remain source association scores."""
    endpoint = "https://api.platform.opentargets.org/api/v4/graphql"
    query = "query Q($id:String!,$size:Int!){disease(efoId:$id){associatedTargets(page:{index:0,size:$size}){rows{score target{id approvedSymbol}}}}}"
    def __init__(self, client): self.client = client
    def collect(self, diseases, max_targets=25, min_score=.3):
        entities, relations, unresolved = [], [], 0
        for disease in diseases:
            efo = disease['canonicalId']
            if not disease['canonicalId'].startswith('EFO:'): continue
            # Open Targets uses underscore EFO IDs at its GraphQL boundary, while
            # ChEMBL supplies colon-delimited EFO IDs. This is a lexical mapping,
            # not a name-based entity merge.
            source_efo = efo.replace('EFO:', 'EFO_', 1)
            response = self.client.post(self.endpoint, json={'query': self.query, 'variables': {'id': source_efo, 'size': max_targets}}); response.raise_for_status(); payload = response.json()
            if not isinstance(payload, dict) or payload.get('errors'):
                raise ValueError('Malformed Open Targets association response')
            source_disease = (payload.get('data') or {}).get('disease')
            # A valid GraphQL null is an unmapped source record, not evidence.
            if source_disease is None:
                unresolved += 1; continue
            rows = (source_disease.get('associatedTargets') or {}).get('rows')
            if not isinstance(rows, list): raise ValueError('Malformed Open Targets association response')
            for row in rows:
                target = row.get('target') or {}; target_id, name, score = target.get('id'), target.get('approvedSymbol'), row.get('score')
                if not target_id or not name or not isinstance(score, (int,float)) or score < min_score: unresolved += 1; continue
                canonical = f'ENSEMBL:{target_id}'; entities.append(entity(canonical, 'TARGET', name, 'OpenTargets'))
                relations.append(relation(canonical, disease['canonicalId'], 'DISEASE_TARGET', 'OpenTargets', f'{target_id}:{source_efo}', {'associationScore': score, 'directness': 'source-returned', 'minimumScore': min_score, 'sourceDiseaseId': source_efo}, 'SOURCE_ASSOCIATION'))
        return entities, relations, unresolved
    def normalize_association(self, target_ensembl_id: str, disease_efo_id: str, source_record_id: str, metadata: Dict[str,Any]) -> Dict[str,Any]:
        return relation(f"ENSEMBL:{target_ensembl_id}", f"EFO:{disease_efo_id}", "DISEASE_TARGET", "OpenTargets", source_record_id, metadata, "COMPUTATIONAL_ASSOCIATION")

class ReactomeAdapter:
    base_url = 'https://reactome.org/ContentService/data'
    def __init__(self, client): self.client = client
    def version(self):
        response = self.client.get(f'{self.base_url}/database/version'); response.raise_for_status(); return response.text.strip()
    def collect(self, targets, max_targets: Optional[int] = None):
        entities, relations, unresolved = [], [], 0
        for target in targets[:max_targets] if max_targets else targets:
            if not target['canonicalId'].startswith('ENSEMBL:'): continue
            gene = target['canonicalId'].replace('ENSEMBL:', '')
            response = self.client.get(f'{self.base_url}/mapping/ENSEMBL/{gene}/pathways')
            if getattr(response, 'status_code', None) == 404:
                unresolved += 1; continue
            response.raise_for_status(); pathways = response.json()
            if not isinstance(pathways, list): raise ValueError('Malformed Reactome pathway response')
            for pathway in pathways:
                pathway_id, name, species = pathway.get('stId'), pathway.get('displayName'), pathway.get('speciesName')
                if not pathway_id or not name or pathway_id.startswith('R-HSA-') is False or species != 'Homo sapiens': continue
                entities.append(entity(f'REACTOME:{pathway_id}', 'PATHWAY', name, 'Reactome'))
                relations.append(relation(target['canonicalId'], f'REACTOME:{pathway_id}', 'TARGET_PATHWAY', 'Reactome', pathway_id, {'species': species}, 'CURATED_PATHWAY'))
        return entities, relations, unresolved

def add_pinned_open_targets(entities, relations, cache_dir: Path, minimum_score=.3):
    """Append only release-pinned, exact-ID matched direct associations."""
    diseases = [e for e in entities if e['entityType'] == 'DISEASE']
    by_source_id = {e['canonicalId'].replace(':', '_', 1): e['canonicalId'] for e in diseases if e['canonicalId'].split(':', 1)[0] in {'EFO', 'MONDO', 'HP'}}
    rows = read_direct_associations(cache_dir, [e['canonicalId'] for e in diseases], minimum_score)
    for row in rows:
        disease = by_source_id.get(row['diseaseId'])
        if not disease: continue
        target = f"ENSEMBL:{row['targetId']}"
        entities.append(entity(target, 'TARGET', row['targetId'], 'OpenTargets'))
        metadata = {'sourceDiseaseIdentifier': row['diseaseId'], 'canonicalDiseaseId': disease, 'mappingStatus': 'EXACT', 'mappingMethod': 'namespace-format', 'sourceAssociationScore': row['associationScore'], 'evidenceCount': row['evidenceCount'], 'aggregationType': 'overall_direct', 'sourceRelease': OPEN_TARGETS_RELEASE, 'sourceFile': OPEN_TARGETS_DATASETS['association_overall_direct_part_00000'], 'minimumAssociationScore': minimum_score}
        relations.append(relation(target, disease, 'DISEASE_TARGET', 'OpenTargets', f"{row['targetId']}:{row['diseaseId']}", metadata, 'SOURCE_ASSOCIATION'))
    return len(rows)

def add_complete_pinned_open_targets(entities, relations, cache_dir: Path, minimum_score=.3):
    """Append complete, hash-verified Open Targets direct associations for V5 only."""
    diseases = [item for item in entities if item['entityType'] == 'DISEASE']
    by_original = {item['canonicalId']: item['canonicalId'] for item in diseases}
    rows, mappings, manifest = read_complete_direct_associations(cache_dir, by_original, minimum_score)
    for row in rows:
        disease = by_original[row['originalDiseaseId']]
        target = f"ENSEMBL:{row['targetId']}"
        entities.append(entity(target, 'TARGET', row['targetId'], 'OpenTargets'))
        metadata = {
            'originalDiseaseId': row['originalDiseaseId'],
            'canonicalOpenTargetsDiseaseId': row['canonicalOpenTargetsDiseaseId'],
            'mappingStatus': row['mappingStatus'],
            'sourceAssociationScore': row['associationScore'],
            'evidenceCount': row['evidenceCount'],
            'aggregationType': row['aggregationType'],
            'associationSemantics': 'direct',
            'sourceRelease': row['sourceRelease'],
            'sourceFile': row['sourceFile'],
            'minimumAssociationScore': minimum_score,
        }
        relations.append(relation(target, disease, 'DISEASE_TARGET', 'OpenTargets', f"{row['targetId']}:{row['canonicalOpenTargetsDiseaseId']}", metadata, 'SOURCE_ASSOCIATION'))
    return {'rows': len(rows), 'mappings': mappings, 'manifest': manifest}

def canonicalize_drug_targets(entities, relations, crosswalk: Dict[str, Any]):
    """Expand only exact human component mappings; preserve original provenance."""
    entries={e['chemblTargetId']: e for e in crosswalk.get('entries', [])}
    if not entries: raise ValueError('Malformed target crosswalk')
    new_relations=[]
    for edge in relations:
        if edge['relationType'] != 'DRUG_TARGET' or not edge['target'].startswith('CHEMBL_TARGET:'):
            new_relations.append(edge); continue
        target_id=edge['target'].split(':',1)[1]; entry=entries.get(target_id)
        genes=[(c,g) for c in (entry or {}).get('components', []) for g in c.get('ensemblGeneIds', []) if c.get('mappingStatus') in {'EXACT','ONE_TO_MANY'} and g.startswith('ENSG')]
        if not genes:
            # No authoritative human Ensembl mapping; status remains in crosswalk.
            continue
        for component,gene in genes:
            canonical=f'ENSEMBL:{gene}'; entities.append(entity(canonical,'TARGET',gene,'ChEMBL'))
            provenance=edge['provenance'][0]
            metadata={**provenance.get('metadata',{}),'originalChEMBLTargetId':target_id,'chemblComponentId':component.get('chemblComponentId'),'uniprotId':component.get('uniprotId'),'ensemblGeneId':gene,'mappingStatus':component['mappingStatus'],'mappingMethod':component['mappingMethod'],'crosswalkVersion':crosswalk.get('version')}
            new_relations.append(relation(edge['source'],canonical,'DRUG_TARGET','ChEMBL',provenance['sourceRecordId'],metadata,'CURATED_SOURCE'))
    return entities,new_relations

def deduplicate(entities: Iterable[Dict[str,Any]], relations: Iterable[Dict[str,Any]]) -> tuple[List[Dict[str,Any]],List[Dict[str,Any]],int,int]:
    entity_map: Dict[str,Dict[str,Any]] = {}; entity_merges = 0
    for item in entities:
        prior = entity_map.get(item["canonicalId"])
        if prior: prior["aliases"] = sorted(set(prior["aliases"] + item["aliases"])); prior["provenance"].extend(item["provenance"]); entity_merges += 1
        else: entity_map[item["canonicalId"]] = item
    edge_map: Dict[tuple,Dict[str,Any]] = {}; edge_merges = 0
    for item in relations:
        edge_key = (item["source"], item["target"], item["relationType"]); prior = edge_map.get(edge_key)
        if prior: prior["provenance"].extend(item["provenance"]); edge_merges += 1
        else: edge_map[edge_key] = item
    return list(entity_map.values()), list(edge_map.values()), entity_merges, edge_merges

def report(entities: List[Dict[str,Any]], relations: List[Dict[str,Any]], entity_merges: int, edge_merges: int, unresolved_entities: int = 0) -> Dict[str,Any]:
    degree = Counter(x for r in relations for x in (r["source"], r["target"])); types = Counter(e["entityType"] for e in entities)
    return {"totalEntities": len(entities), "entitiesByType": dict(types), "totalRelations": len(relations), "relationsByType": dict(Counter(r["relationType"] for r in relations)), "sourceCoverage": dict(Counter(p["source"] for r in relations for p in r["provenance"])), "isolatedEntities": sum(degree[e["canonicalId"]] == 0 for e in entities), "duplicateEntityMerges": entity_merges, "duplicateEdgeMerges": edge_merges, "missingIdentifiers": 0, "unresolvedEntities": unresolved_entities, "drugDiseaseIndications": sum(r["relationType"] == "DRUG_INDICATION" for r in relations), "degree": {"min": min(degree.values(), default=0), "max": max(degree.values(), default=0), "mean": sum(degree.values()) / len(degree) if degree else 0}}

def dataset_hash(entities: List[Dict[str,Any]], relations: List[Dict[str,Any]]) -> str:
    """Hash biomedical content, not wall-clock retrieval timestamps."""
    def clean(value):
        if isinstance(value, dict): return {k: clean(v) for k, v in value.items() if k != "retrievedAt"}
        if isinstance(value, list): return [clean(v) for v in value]
        return value
    return hashlib.sha256(json.dumps(clean({"entities": entities, "relations": relations}), sort_keys=True).encode()).hexdigest()

def _sorted_graph_content(entities: List[Dict[str, Any]], relations: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Canonicalize ordering before the content hash and artifact write."""
    def provenance_key(item: Dict[str, Any]) -> str:
        return json.dumps({key: value for key, value in item.items() if key != "retrievedAt"}, sort_keys=True)
    for item in entities:
        item["aliases"] = sorted(set(item.get("aliases", [])))
        item["sourceIds"] = dict(sorted(item.get("sourceIds", {}).items()))
        item["provenance"] = sorted(item.get("provenance", []), key=provenance_key)
    for item in relations:
        item["provenance"] = sorted(item.get("provenance", []), key=provenance_key)
    return (sorted(entities, key=lambda item: item["canonicalId"]), sorted(relations, key=lambda item: (item["source"], item["target"], item["relationType"])))

def _load_json(path: Path, label: str) -> Dict[str, Any]:
    if not path.is_file(): raise ValueError(f"{label} missing: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed {label}: {path}") from exc
    if not isinstance(value, dict): raise ValueError(f"Malformed {label}: {path}")
    return value

def _validate_frozen_chembl(source_dir: Path) -> Dict[str, Any]:
    manifest = _load_json(source_dir / "source_manifest.json", "frozen ChEMBL manifest")
    if manifest.get("snapshotLabel") != "frozen-rest-snapshot-2026-09-21": raise ValueError("Unexpected frozen ChEMBL snapshot")
    entries = manifest.get("files")
    if not isinstance(entries, list): raise ValueError("Frozen ChEMBL manifest lacks file hashes")
    for item in entries:
        path = source_dir / str(item.get("name", "")); expected = item.get("sha256")
        if not path.is_file() or not isinstance(expected, str) or sha256_file(path).lower() != expected.lower(): raise ValueError("Frozen ChEMBL integrity validation failed")
    return manifest

def _validate_pinned_open_targets(source_dir: Path) -> Dict[str, Any]:
    manifest = _load_json(source_dir / "open_targets_source_manifest.json", "pinned Open Targets manifest")
    if manifest.get("source") != "Open Targets Platform" or manifest.get("release") != OPEN_TARGETS_RELEASE: raise ValueError("Unexpected pinned Open Targets release")
    for url in OPEN_TARGETS_DATASETS.values():
        path = source_dir / Path(url).name
        if not path.is_file() or path.stat().st_size == 0: raise ValueError(f"Pinned Open Targets input missing: {path}")
    return manifest

def _offline_lineage(chembl_dir: Path, crosswalk: Path, open_targets_dir: Path, reactome_dir: Path, chembl_manifest: Dict[str, Any], open_targets_manifest: Dict[str, Any], reactome_manifest: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "ChEMBL": {"snapshotLabel": chembl_manifest["snapshotLabel"], "manifest": str(chembl_dir / "source_manifest.json"), "files": chembl_manifest["files"]},
        "targetCrosswalk": {"artifact": str(crosswalk), "sha256": sha256_file(crosswalk)},
        "OpenTargets": {"release": open_targets_manifest["release"], "manifest": str(open_targets_dir / "open_targets_source_manifest.json"), "files": [{"name": Path(url).name, "sha256": sha256_file(open_targets_dir / Path(url).name)} for url in OPEN_TARGETS_DATASETS.values()]},
        "Reactome": {"release": reactome_manifest["release"], "manifest": str(reactome_dir / "source_manifest.json"), "manifestSha256": sha256_file(reactome_dir / "source_manifest.json"), "files": reactome_manifest["files"], "targetListSha256": reactome_manifest["targetSelection"]["inputTargetListSha256"]},
    }

def _build_offline(output_dir: Path, *, max_drugs: int, min_association_score: float, frozen_chembl_dir: Path, frozen_crosswalk: Path, pinned_open_targets_dir: Path, frozen_reactome_dir: Path, dataset_version: str) -> Path:
    if any(value is None for value in (frozen_chembl_dir, frozen_crosswalk, pinned_open_targets_dir, frozen_reactome_dir)):
        raise ValueError("All frozen source inputs are required for offline build")
    chembl_dir, crosswalk_path, open_targets_dir, reactome_dir = map(Path, (frozen_chembl_dir, frozen_crosswalk, pinned_open_targets_dir, frozen_reactome_dir))
    if not chembl_dir.is_dir(): raise ValueError("Frozen ChEMBL directory is required for offline build")
    if not open_targets_dir.is_dir(): raise ValueError("Pinned Open Targets directory is required for offline build")
    if not reactome_dir.is_dir(): raise ValueError("Frozen Reactome directory is required for offline build")
    chembl_manifest = _validate_frozen_chembl(chembl_dir)
    open_targets_manifest = _validate_pinned_open_targets(open_targets_dir)
    try:
        reactome_records, reactome_manifest = load_frozen_reactome(reactome_dir, REACTOME_RELEASE)
    except ReactomeArtifactError as exc:
        raise ValueError(f"Frozen Reactome validation failed: {exc}") from exc
    entities, relations = FrozenChEMBLAdapter(chembl_dir).collect(max_drugs)
    required_target_ids = sorted({edge["target"].split(":", 1)[1] for edge in relations if edge["relationType"] == "DRUG_TARGET" and edge["target"].startswith("CHEMBL_TARGET:")})
    crosswalk = load_crosswalk(crosswalk_path)
    known_target_ids = {entry["chemblTargetId"] for entry in crosswalk["entries"]}
    if not set(required_target_ids).issubset(known_target_ids): raise ValueError("Frozen target crosswalk is incomplete for required ChEMBL targets")
    entities, relations = canonicalize_drug_targets(entities, relations, crosswalk)
    complete_direct = dataset_version == "biomedical_graph_v5"
    complete_stats = None
    v4_target_ids = set()
    if complete_direct:
        # This is a comparison baseline only; V5 relations remain driven solely
        # by the complete manifest reader below.
        v4_target_ids = {item['canonicalId'] for item in entities if item['canonicalId'].startswith('ENSEMBL:')}
        v4_target_ids.update(f"ENSEMBL:{row['targetId']}" for row in read_direct_associations(open_targets_dir, [item['canonicalId'] for item in entities if item['entityType'] == 'DISEASE'], min_association_score))
        complete_stats = add_complete_pinned_open_targets(entities, relations, open_targets_dir, min_association_score)
        # Canonicalized V5 drug-target edges never reference raw ChEMBL target
        # registry nodes; omit those otherwise-isolated nodes from V5.
        entities = [item for item in entities if not item['canonicalId'].startswith('CHEMBL_TARGET:')]
    else:
        add_pinned_open_targets(entities, relations, open_targets_dir, min_association_score)
        selected_targets = [item["canonicalId"].split(":", 1)[1] for item in entities if item["entityType"] == "TARGET" and item["canonicalId"].startswith("ENSEMBL:")][:30]
        expected_targets = read_target_ids(reactome_dir / "input_ensembl_targets.txt")
        if selected_targets != expected_targets: raise ValueError("Frozen Reactome target list does not match the offline upstream selection")
    for record in reactome_records:
        target, pathway = f"ENSEMBL:{record['ensemblGeneId']}", f"REACTOME:{record['pathwayStableId']}"
        entities.append(entity(pathway, "PATHWAY", record["pathwayName"], "Reactome"))
        relations.append(relation(target, pathway, "TARGET_PATHWAY", "Reactome", record["pathwayStableId"], {"species": "Homo sapiens", "sourceRelease": REACTOME_RELEASE, "sourceFile": "ensembl_to_pathways.tsv"}, "CURATED_PATHWAY"))
    entities, relations, entity_merges, edge_merges = deduplicate(entities, relations)
    entities, relations = _sorted_graph_content(entities, relations)
    releases = {"ChEMBL": "frozen-rest-snapshot-2026-09-21", "OpenTargets": "26.06-complete-direct" if complete_direct else OPEN_TARGETS_RELEASE, "Reactome": REACTOME_RELEASE}
    lineage = _offline_lineage(chembl_dir, crosswalk_path, open_targets_dir, reactome_dir, chembl_manifest, open_targets_manifest, reactome_manifest)
    filters = {"minAssociationScore": min_association_score, "maxDrugs": max_drugs, "reactomeTargetSelection": "frozen_reactome_97_unchanged" if complete_direct else "first_30_ensembl_target_entities_after_frozen_chembl_crosswalk_and_pinned_open_targets"}
    if complete_direct:
        manifest = complete_stats['manifest']
        lineage['OpenTargets'] = {"release": OPEN_TARGETS_RELEASE, "manifest": str(open_targets_dir / 'open_targets_complete_direct_manifest.json'), "dataset": "association_overall_direct", "complete": True, "partitions": manifest['partitions'], "diseaseOntology": {"name": "disease.parquet", "sha256": sha256_file(open_targets_dir / 'disease.parquet')}}
    payload = {"datasetVersion": dataset_version, "generationTimestamp": now(), "sources": list(releases), "sourceVersions": releases, "frozenInputLineage": lineage, "filterConfiguration": filters, "crosswalkLineage": {"artifact": str(crosswalk_path), "requiredTargetCount": len(required_target_ids), "complete": True}, "entities": entities, "relations": relations}
    payload["datasetHash"] = dataset_hash(entities, relations); payload["qualityReport"] = report(entities, relations, entity_merges, edge_merges)
    if complete_direct:
        disease_target = [edge for edge in relations if edge['relationType'] == 'DISEASE_TARGET']
        covered = {edge['target'] for edge in disease_target}
        associated_targets = {edge['source'] for edge in disease_target}
        pathway_targets = {edge['source'] for edge in relations if edge['relationType'] == 'TARGET_PATHWAY'}
        mapping_counts = Counter(row['mappingStatus'] for row in complete_stats['mappings'].values())
        payload['qualityReport']['diseaseCoverage'] = {'totalDiseases': len([item for item in entities if item['entityType'] == 'DISEASE']), 'withDiseaseTarget': len(covered), 'withoutDiseaseTarget': len([item for item in entities if item['entityType'] == 'DISEASE']) - len(covered), 'coveragePercent': len(covered) * 100 / len([item for item in entities if item['entityType'] == 'DISEASE'])}
        payload['qualityReport']['diseaseMapping'] = {'EXACT': mapping_counts['EXACT'], 'EXACT_OBSOLETE_TERM_MAPPING': mapping_counts['EXACT_OBSOLETE_TERM_MAPPING'], 'unresolved': len([item for item in entities if item['entityType'] == 'DISEASE']) - sum(mapping_counts.values())}
        payload['qualityReport']['targetCoverage'] = {'uniqueDiseaseAssociatedTargets': len(associated_targets), 'newTargetsVsV4': len(associated_targets - v4_target_ids), 'targetsWithTargetPathway': len(associated_targets & pathway_targets), 'targetsWithoutTargetPathway': len(associated_targets - pathway_targets)}
        if (len(covered), len(disease_target), len(associated_targets)) != (155, 16164, 4986): raise ValueError(f"V5 complete direct audit discrepancy: {(len(covered), len(disease_target), len(associated_targets))}")
    destination = Path(output_dir) / f"{dataset_version}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    destination.mkdir(parents=True)
    (destination / "graph.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (destination / "quality_report.json").write_text(json.dumps(payload["qualityReport"], indent=2), encoding="utf-8")
    return destination

def build(output_dir: Path, max_drugs: int = 20, client: Optional[httpx.Client] = None, include_open_targets=False, include_reactome=False, max_diseases=20, min_association_score=.3, pinned_open_targets_cache: Optional[Path] = None, parent_crosswalk: Optional[Path] = None, crosswalk_output_dir: Optional[Path] = None, frozen_chembl_dir: Optional[Path] = None, frozen_crosswalk: Optional[Path] = None, pinned_open_targets_dir: Optional[Path] = None, frozen_reactome_dir: Optional[Path] = None, offline: bool = False, dataset_version: Optional[str] = None) -> Path:
    if offline:
        if dataset_version is None: dataset_version = "biomedical_graph_v4"
        return _build_offline(output_dir, max_drugs=max_drugs, min_association_score=min_association_score, frozen_chembl_dir=frozen_chembl_dir, frozen_crosswalk=frozen_crosswalk, pinned_open_targets_dir=pinned_open_targets_dir, frozen_reactome_dir=frozen_reactome_dir, dataset_version=dataset_version)
    if client is not None:
        if frozen_chembl_dir:
            entities, relations = FrozenChEMBLAdapter(frozen_chembl_dir).collect(max_drugs)
            releases = {'ChEMBL': 'frozen-rest-snapshot-2026-09-21'}
        else:
            entities, relations = ChEMBLAdapter(client).collect(max_drugs)
            releases = {'ChEMBL': 'live-api'}
        required_target_ids=sorted({r['target'].split(':',1)[1] for r in relations if r['relationType']=='DRUG_TARGET' and r['target'].startswith('CHEMBL_TARGET:')})
        crosswalk_lineage = None
        if parent_crosswalk:
            snapshot, counts = expand_crosswalk(required_target_ids, parent_crosswalk, crosswalk_output_dir or output_dir.parent/'target_crosswalks'/'build_snapshot', client)
            crosswalk=load_crosswalk(snapshot)
            if not set(required_target_ids).issubset({x['chemblTargetId'] for x in crosswalk['entries']}): raise ValueError('Incomplete target crosswalk coverage')
            entities, relations=canonicalize_drug_targets(entities,relations,crosswalk); crosswalk_lineage={'artifact':str(snapshot),'parent':str(parent_crosswalk),'requiredTargetCount':len(required_target_ids),**counts,'complete':True}
        unresolved_entities = 0
        if include_open_targets:
            diseases = [x for x in entities if x['entityType'] == 'DISEASE'][:max_diseases]; e, r, unresolved = OpenTargetsAdapter(client).collect(diseases, min_score=min_association_score); entities += e; relations += r; unresolved_entities += unresolved; releases['OpenTargets'] = 'unversioned-graphql-live'
        if pinned_open_targets_cache:
            add_pinned_open_targets(entities, relations, pinned_open_targets_cache, min_association_score); releases['OpenTargets'] = OPEN_TARGETS_RELEASE
        if include_reactome:
            targets = [x for x in entities if x['canonicalId'].startswith('ENSEMBL:')]; e, r, _ = ReactomeAdapter(client).collect(targets, 30); entities += e; relations += r; releases['Reactome'] = ReactomeAdapter(client).version()
    else:
        with httpx.Client(timeout=20) as managed:
            if frozen_chembl_dir:
                entities, relations = FrozenChEMBLAdapter(frozen_chembl_dir).collect(max_drugs)
                releases = {'ChEMBL': 'frozen-rest-snapshot-2026-09-21'}
            else:
                entities, relations = ChEMBLAdapter(managed).collect(max_drugs)
                releases = {'ChEMBL': 'live-api'}
            required_target_ids=sorted({r['target'].split(':',1)[1] for r in relations if r['relationType']=='DRUG_TARGET' and r['target'].startswith('CHEMBL_TARGET:')})
            crosswalk_lineage = None
            if parent_crosswalk:
                snapshot, counts = expand_crosswalk(required_target_ids, parent_crosswalk, crosswalk_output_dir or output_dir.parent/'target_crosswalks'/'build_snapshot', managed)
                crosswalk=load_crosswalk(snapshot)
                if not set(required_target_ids).issubset({x['chemblTargetId'] for x in crosswalk['entries']}): raise ValueError('Incomplete target crosswalk coverage')
                entities, relations=canonicalize_drug_targets(entities,relations,crosswalk); crosswalk_lineage={'artifact':str(snapshot),'parent':str(parent_crosswalk),'requiredTargetCount':len(required_target_ids),**counts,'complete':True}
            unresolved_entities = 0
            if include_open_targets:
                diseases = [x for x in entities if x['entityType'] == 'DISEASE'][:max_diseases]; e, r, unresolved = OpenTargetsAdapter(managed).collect(diseases, min_score=min_association_score); entities += e; relations += r; unresolved_entities += unresolved; releases['OpenTargets'] = 'unversioned-graphql-live'
            if pinned_open_targets_cache:
                add_pinned_open_targets(entities, relations, pinned_open_targets_cache, min_association_score); releases['OpenTargets'] = OPEN_TARGETS_RELEASE
            if include_reactome:
                targets = [x for x in entities if x['canonicalId'].startswith('ENSEMBL:')]; e, r, _ = ReactomeAdapter(managed).collect(targets, 30); entities += e; relations += r; releases['Reactome'] = ReactomeAdapter(managed).version()
    entities, relations, entity_merges, edge_merges = deduplicate(entities, relations)
    payload = {"datasetVersion": "biomedical_graph_v2", "generationTimestamp": now(), "sources": list(releases), "sourceVersions": releases, "filterConfiguration": {'minAssociationScore': min_association_score, 'maxDiseases': max_diseases, 'maxDrugs':max_drugs, 'drugSelection':'max_phase=4; molecule_chembl_id ascending'}, "crosswalkLineage": crosswalk_lineage, "entities": entities, "relations": relations}
    payload["datasetHash"] = dataset_hash(entities, relations); payload["qualityReport"] = report(entities, relations, entity_merges, edge_merges, unresolved_entities)
    destination = output_dir / f"biomedical_graph_v2_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"; destination.mkdir(parents=True); (destination / "graph.json").write_text(json.dumps(payload, indent=2)); (destination / "quality_report.json").write_text(json.dumps(payload["qualityReport"], indent=2)); return destination

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--output-dir", type=Path, required=True); parser.add_argument("--max-drugs", type=int, default=20); parser.add_argument('--max-diseases', type=int, default=20); parser.add_argument('--open-targets', action='store_true'); parser.add_argument('--reactome', action='store_true'); parser.add_argument('--frozen-chembl-dir', type=Path); parser.add_argument('--frozen-crosswalk', type=Path); parser.add_argument('--pinned-open-targets-dir', type=Path); parser.add_argument('--frozen-reactome-dir', type=Path); parser.add_argument('--offline', action='store_true'); parser.add_argument('--dataset-version'); args = parser.parse_args(); print(build(args.output_dir, args.max_drugs, include_open_targets=args.open_targets, include_reactome=args.reactome, max_diseases=args.max_diseases, frozen_chembl_dir=args.frozen_chembl_dir, frozen_crosswalk=args.frozen_crosswalk, pinned_open_targets_dir=args.pinned_open_targets_dir, frozen_reactome_dir=args.frozen_reactome_dir, offline=args.offline, dataset_version=args.dataset_version))



