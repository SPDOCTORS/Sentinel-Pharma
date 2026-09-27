"""Authoritative ChEMBL component → UniProt → Ensembl target crosswalk."""
from __future__ import annotations
from typing import Any
import json, time
from datetime import datetime, timezone
from pathlib import Path
import httpx

def component_records(target: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep every ChEMBL component; reject non-human targets for this graph."""
    if target.get('organism') != 'Homo sapiens':
        return [{'chemblTargetId': target.get('target_chembl_id'), 'mappingStatus': 'UNRESOLVED', 'reason': 'NON_HUMAN'}]
    result=[]
    for component in target.get('target_components') or []:
        accession=component.get('accession')
        result.append({'chemblTargetId': target.get('target_chembl_id'), 'chemblComponentId': component.get('component_id'), 'uniprotId': accession, 'componentType': component.get('component_type'), 'mappingStatus': 'EXACT' if accession else 'UNRESOLVED', 'mappingMethod': 'CHEMBL_COMPONENT_UNIPROT', 'reason': None if accession else 'NO_COMPONENT_ACCESSION'})
    return result or [{'chemblTargetId': target.get('target_chembl_id'), 'mappingStatus': 'UNRESOLVED', 'reason': 'NO_COMPONENT_ACCESSION'}]

def add_uniprot_ensembl(record: dict[str, Any], uniprot_payload: dict[str, Any]) -> dict[str, Any]:
    """Use only UniProt's GeneId property; transcript IDs are not canonical genes."""
    genes=[]
    for ref in uniprot_payload.get('uniProtKBCrossReferences') or []:
        if ref.get('database') == 'Ensembl':
            genes.extend(p['value'].split('.')[0] for p in ref.get('properties', []) if p.get('key') == 'GeneId' and p.get('value'))
    genes=sorted(set(genes))
    if not genes:
        record.update(mappingStatus='UNRESOLVED', reason='NO_EXACT_ENSEMBL_MAPPING'); return record
    record.update(ensemblGeneIds=genes, mappingStatus='EXACT' if len(genes)==1 else 'ONE_TO_MANY', mappingMethod='CHEMBL_COMPONENT_UNIPROT_TO_ENSEMBL'); return record

def _get_json(client, url, cache_path: Path, retries=2):
    if cache_path.exists():
        try:
            value=json.loads(cache_path.read_text())
            if isinstance(value, dict): return value, 'CACHE_HIT'
        except json.JSONDecodeError: cache_path.unlink()
    for attempt in range(retries + 1):
        try:
            response=client.get(url)
            if response.status_code == 404: return None, 'NOT_FOUND'
            if response.status_code == 429 or response.status_code >= 500: raise httpx.HTTPStatusError('transient', request=response.request, response=response)
            response.raise_for_status(); value=response.json()
            if not isinstance(value, dict): return None, 'MALFORMED'
            cache_path.parent.mkdir(parents=True, exist_ok=True); cache_path.write_text(json.dumps(value)); return value, 'FETCHED'
        except (httpx.TimeoutException, httpx.HTTPStatusError, json.JSONDecodeError):
            if attempt == retries: return None, 'TRANSIENT_FAILURE'
            time.sleep(.25 * (attempt + 1))

def run_controlled_crosswalk(target_ids, output_dir: Path, client=None):
    """Sequential 12-target runner with cache and per-target checkpoints."""
    output_dir.mkdir(parents=True, exist_ok=True); checkpoint=output_dir/'checkpoint.json'
    completed=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    managed=client or httpx.Client(timeout=20)
    try:
        for index, target_id in enumerate(target_ids, 1):
            if target_id in completed: continue
            target,status=_get_json(managed, f'https://www.ebi.ac.uk/chembl/api/data/target/{target_id}.json', output_dir/'cache'/'chembl'/f'{target_id}.json')
            if not target: completed[target_id]={'chemblTargetId':target_id,'mappingStatus':'UNRESOLVED','reason':status}; checkpoint.write_text(json.dumps(completed,indent=2)); continue
            records=component_records(target)
            for record in records:
                accession=record.get('uniprotId')
                if accession:
                    data,result=_get_json(managed, f'https://rest.uniprot.org/uniprotkb/{accession}.json', output_dir/'cache'/'uniprot'/f'{accession}.json')
                    if data: add_uniprot_ensembl(record,data)
                    else: record.update(mappingStatus='UNRESOLVED', reason=result)
            completed[target_id]={'chemblTargetId':target_id,'chemblTargetType':target.get('target_type'),'organism':target.get('organism'),'components':records,'progress':f'{index}/{len(target_ids)}','retrievedAt':datetime.now(timezone.utc).isoformat()}
            checkpoint.write_text(json.dumps(completed,indent=2))
    finally:
        if client is None: managed.close()
    if set(completed) != set(target_ids): raise ValueError('Incomplete target crosswalk')
    final={'version':'chembl-uniprot-ensembl-v1','entries':[completed[x] for x in target_ids]}; final_path=output_dir/'target_crosswalk.json'; final_path.write_text(json.dumps(final,indent=2)); return final_path

def load_crosswalk(path: Path) -> dict[str, Any]:
    value=json.loads(path.read_text())
    entries=value.get('entries')
    if not isinstance(entries,list) or any(not e.get('chemblTargetId') for e in entries): raise ValueError('Malformed target crosswalk')
    return value

def expand_crosswalk(required_target_ids, parent_path: Path, output_dir: Path, client=None) -> tuple[Path, dict[str,int]]:
    """Create a new complete snapshot; unresolved entries count as processed."""
    parent=load_crosswalk(parent_path); known={e['chemblTargetId']:e for e in parent['entries']}; required=list(dict.fromkeys(required_target_ids)); missing=[x for x in required if x not in known]
    if missing:
        child_path=run_controlled_crosswalk(missing, output_dir/'incremental', client)
        known.update({e['chemblTargetId']:e for e in load_crosswalk(child_path)['entries']})
    if set(required)-set(known): raise ValueError('Incomplete target crosswalk coverage')
    snapshot={'version':'chembl-uniprot-ensembl-v1-expanded','parentCrosswalk':str(parent_path),'requiredTargetIds':required,'entries':[known[x] for x in required],'buildTimestamp':datetime.now(timezone.utc).isoformat()}
    output_dir.mkdir(parents=True,exist_ok=True); path=output_dir/'target_crosswalk.json'; path.write_text(json.dumps(snapshot,indent=2)); return path,{'required':len(required),'reused':len(required)-len(missing),'processed':len(missing)}
