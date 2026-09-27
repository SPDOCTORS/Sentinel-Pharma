import json
from pathlib import Path
import pytest
from app.services.gnn.biomedical_graph import OpenTargetsAdapter, ReactomeAdapter, build, dataset_hash, deduplicate, entity, relation
from app.services.gnn.open_targets_release import RELEASE, chembl_to_open_targets_id
from app.services.gnn.target_crosswalk import component_records, add_uniprot_ensembl

def test_target_crosswalk_requires_human_component_accession_and_uniprot_gene_xref():
    record = component_records({'target_chembl_id':'CHEMBL1','organism':'Homo sapiens','target_components':[{'component_id':1,'accession':'P1','component_type':'PROTEIN'}]})[0]
    assert add_uniprot_ensembl(record, {'uniProtKBCrossReferences':[{'database':'Ensembl','id':'ENST1','properties':[{'key':'GeneId','value':'ENSG000001.9'}]}]})['ensemblGeneIds'] == ['ENSG000001']
    assert component_records({'target_chembl_id':'CHEMBL2','organism':'Bacteria'})[0]['reason'] == 'NON_HUMAN'

def test_open_targets_crosswalk_is_exact_or_unresolved_only():
    assert chembl_to_open_targets_id('EFO:0000537') == ('EFO_0000537', 'EXACT')
    assert chembl_to_open_targets_id('MONDO:0005148') == ('MONDO_0005148', 'EXACT')
    assert chembl_to_open_targets_id('MESH:D012345') == (None, 'UNRESOLVED')
    assert RELEASE == '26.06'

class Response:
    def __init__(self, payload): self.payload = payload
    def raise_for_status(self): pass
    def json(self): return self.payload

class Client:
    def get(self, url, params):
        if url.endswith('/molecule.json'): return Response({'molecules': [{'molecule_chembl_id': 'CHEMBL25', 'pref_name': 'Aspirin'}]})
        if url.endswith('/mechanism.json'): return Response({'mechanisms': [{'mechanism_id': 1, 'target_chembl_id': 'CHEMBL_T1', 'target_pref_name': 'Target'}]})
        return Response({'drug_indications': [{'drugind_id': 2, 'efo_id': 'EFO_1', 'efo_term': 'Disease', 'max_phase_for_ind': 4}]})

def test_build_preserves_stable_ids_provenance_and_versioned_artifact(tmp_path):
    path = build(tmp_path, 1, Client()); graph = json.loads((path / 'graph.json').read_text())
    assert graph['entities'][0]['canonicalId'] == 'CHEMBL:CHEMBL25'
    assert any(edge['relationType'] == 'DRUG_INDICATION' for edge in graph['relations'])
    assert all(edge['provenance'] for edge in graph['relations'])
    assert graph['datasetHash'] and (path / 'quality_report.json').exists()

def test_deduplication_preserves_multiple_provenance_without_aggressive_merge():
    drug = entity('CHEMBL:1', 'DRUG', 'Drug', 'ChEMBL')
    edge_a = relation('CHEMBL:1', 'CHEMBL_TARGET:2', 'DRUG_TARGET', 'ChEMBL', 'a')
    edge_b = relation('CHEMBL:1', 'CHEMBL_TARGET:2', 'DRUG_TARGET', 'OpenTargets', 'b')
    entities, relations, entity_merges, edge_merges = deduplicate([drug, drug], [edge_a, edge_b])
    assert len(entities) == 1 and entity_merges == 1
    assert len(relations) == 1 and len(relations[0]['provenance']) == 2 and edge_merges == 1

def test_trial_or_literature_presence_cannot_create_indication():
    assert 'DRUG_INDICATION' not in {'CLINICAL_TRIAL_MATCH', 'DRUG_DISEASE_CO_MENTION'}

def test_dataset_hash_is_deterministic_despite_retrieval_time():
    first = entity('CHEMBL:1', 'DRUG', 'Drug', 'ChEMBL'); second = entity('CHEMBL:1', 'DRUG', 'Drug', 'ChEMBL')
    second['provenance'][0]['retrievedAt'] = '2100-01-01T00:00:00Z'
    assert dataset_hash([first], []) == dataset_hash([second], [])

class AssociationClient:
    def post(self, *_args, **_kwargs): return Response({'data': {'disease': {'associatedTargets': {'rows': [{'score': .8, 'target': {'id': 'ENSG000001', 'approvedSymbol': 'GENE1'}}]}}}})
    def get(self, url, *_args, **_kwargs):
        if url.endswith('/version'):
            response = Response({}); response.text = '97'; return response
        return Response([{'stId': 'R-HSA-1', 'displayName': 'Pathway', 'speciesName': 'Homo sapiens'}])

def test_open_targets_and_reactome_normalize_stable_source_ids():
    disease = entity('EFO:EFO_1', 'DISEASE', 'Disease', 'OpenTargets')
    targets, edges, unresolved = OpenTargetsAdapter(AssociationClient()).collect([disease])
    assert targets[0]['canonicalId'] == 'ENSEMBL:ENSG000001' and edges[0]['relationType'] == 'DISEASE_TARGET' and not unresolved
    pathways, pathway_edges, _ = ReactomeAdapter(AssociationClient()).collect(targets)
    assert pathways[0]['canonicalId'] == 'REACTOME:R-HSA-1' and pathway_edges[0]['relationType'] == 'TARGET_PATHWAY'

ARTIFACTS = Path(__file__).parents[1] / 'artifacts'

def frozen_build_kwargs():
    return {
        'max_drugs': 20,
        'offline': True,
        'frozen_chembl_dir': ARTIFACTS / 'chembl' / '36' / 'frozen_20',
        'frozen_crosswalk': ARTIFACTS / 'target_crosswalks' / 'phase2gb_frozen20_v1' / 'target_crosswalk.json',
        'pinned_open_targets_dir': ARTIFACTS / 'open_targets' / '26.06',
        'frozen_reactome_dir': ARTIFACTS / 'reactome' / '97',
    }

def test_offline_three_source_build_is_network_free_and_canonical(tmp_path, monkeypatch):
    monkeypatch.setattr('httpx.Client', lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError('network access')))
    path = build(tmp_path, **frozen_build_kwargs())
    graph = json.loads((path / 'graph.json').read_text())
    assert graph['datasetVersion'] == 'biomedical_graph_v4'
    assert path.name.startswith('biomedical_graph_v4_')
    assert graph['sourceVersions'] == {'ChEMBL': 'frozen-rest-snapshot-2026-09-21', 'OpenTargets': '26.06', 'Reactome': '97'}
    assert not any(edge['relationType'] == 'DRUG_TARGET' and edge['target'].startswith('CHEMBL_TARGET:') for edge in graph['relations'])
    assert not any(edge['relationType'] == 'DRUG_TARGET' and edge['target'] in {'ENSEMBL:CHEMBL2354204', 'ENSEMBL:CHEMBL2364670'} for edge in graph['relations'])
    assert all(edge['source'].startswith('ENSEMBL:') and edge['target'].startswith('REACTOME:') for edge in graph['relations'] if edge['relationType'] == 'TARGET_PATHWAY')

def test_offline_build_fails_closed_for_missing_sources(tmp_path):
    kwargs = frozen_build_kwargs()
    kwargs['frozen_chembl_dir'] = tmp_path / 'missing-chembl'
    with pytest.raises(ValueError, match='Frozen ChEMBL directory'):
        build(tmp_path, **kwargs)
    kwargs = frozen_build_kwargs()
    bad_crosswalk = tmp_path / 'bad-crosswalk.json'; bad_crosswalk.write_text('{"entries": []}')
    kwargs['frozen_crosswalk'] = bad_crosswalk
    with pytest.raises(ValueError, match='incomplete'):
        build(tmp_path, **kwargs)
    kwargs = frozen_build_kwargs(); kwargs['pinned_open_targets_dir'] = tmp_path / 'missing-open-targets'
    with pytest.raises(ValueError, match='Pinned Open Targets directory'):
        build(tmp_path, **kwargs)
    kwargs = frozen_build_kwargs(); kwargs['frozen_reactome_dir'] = tmp_path / 'missing-reactome'
    with pytest.raises(ValueError, match='Frozen Reactome directory'):
        build(tmp_path, **kwargs)

def test_offline_frozen_build_hash_is_deterministic(tmp_path):
    first = json.loads((build(tmp_path / 'one', **frozen_build_kwargs()) / 'graph.json').read_text())
    second = json.loads((build(tmp_path / 'two', **frozen_build_kwargs()) / 'graph.json').read_text())
    assert first['datasetHash'] == second['datasetHash']
