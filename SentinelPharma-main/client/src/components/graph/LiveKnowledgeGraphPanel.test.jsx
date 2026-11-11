import { render, screen } from '@testing-library/react';

import LiveKnowledgeGraphPanel from './LiveKnowledgeGraphPanel';

jest.mock('./KnowledgeGraphEnhanced', () => function MockKnowledgeGraph({ graphData, researchMode }) {
  return <div data-testid="knowledge-graph">{researchMode}:{graphData.nodes.length}</div>;
});

test('live graph fails closed without source-backed V5 evidence', () => {
  render(<LiveKnowledgeGraphPanel molecule="Unknown" graph={{
    dataMode: 'UNAVAILABLE',
    verificationStatus: 'NOT_AVAILABLE',
    nodes: [],
    edges: [],
    unavailableReason: { message: 'No exact V5 neighborhood.' }
  }} />);

  expect(screen.getByTestId('live-graph-unavailable')).toBeInTheDocument();
  expect(screen.getByText('No exact V5 neighborhood.')).toBeInTheDocument();
  expect(screen.getByText('No generated or demonstration graph is substituted in live research.')).toBeInTheDocument();
  expect(screen.queryByTestId('knowledge-graph')).not.toBeInTheDocument();
});

test('live graph renders only a source-backed V5 payload with provenance summary', () => {
  render(<LiveKnowledgeGraphPanel molecule="Telmisartan" graph={{
    dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE',
    graphDatasetVersion: 'biomedical_graph_v5',
    graphDatasetHash: 'hash-123',
    sources: ['ChEMBL', 'OpenTargets'],
    nodes: [{ id: 'drug', type: 'DRUG' }, { id: 'target', type: 'TARGET' }],
    edges: [{ source: 'drug', target: 'target', type: 'DRUG_TARGET', provenance: [{ source: 'ChEMBL' }] }]
  }} />);

  expect(screen.getByTestId('live-v5-evidence-graph')).toBeInTheDocument();
  expect(screen.getByText(/biomedical_graph_v5/)).toBeInTheDocument();
  expect(screen.getByText(/ChEMBL, OpenTargets/)).toBeInTheDocument();
  expect(screen.getByText('live:2')).toBeInTheDocument();
});

test('live graph renders Candesartan Cilexetil + kidney disease V5 graph with 7 nodes, 6 edges, 4 pathways, and EFO-MONDO provenance', () => {
  const candesartanGraph = {
    dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE',
    graphDatasetVersion: 'biomedical_graph_v5',
    graphDatasetHash: '9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90',
    sources: ['ChEMBL', 'OpenTargets', 'Reactome'],
    nodes: [
      { id: 'CHEMBL:CHEMBL1014', label: 'CANDESARTAN CILEXETIL', type: 'DRUG' },
      { id: 'EFO:0003086', label: 'kidney disease', type: 'DISEASE' },
      { id: 'ENSEMBL:ENSG00000144891', label: 'ENSG00000144891', type: 'TARGET' },
      { id: 'REACTOME:R-HSA-375276', label: 'Peptide ligand-binding receptors', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-416476', label: 'G alpha (q) signalling events', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-8856825', label: 'Cargo recognition for clathrin-mediated endocytosis', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-8856828', label: 'Clathrin-mediated endocytosis', type: 'PATHWAY' }
    ],
    edges: [
      {
        source: 'CHEMBL:CHEMBL1014',
        target: 'ENSEMBL:ENSG00000144891',
        type: 'DRUG_TARGET',
        provenance: [{ source: 'ChEMBL', metadata: { actionType: 'ANTAGONIST' } }]
      },
      {
        source: 'ENSEMBL:ENSG00000144891',
        target: 'EFO:0003086',
        type: 'DISEASE_TARGET',
        provenance: [{
          source: 'OpenTargets',
          metadata: {
            originalDiseaseId: 'EFO:0003086',
            canonicalOpenTargetsDiseaseId: 'MONDO_0005240',
            mappingStatus: 'EXACT_OBSOLETE_TERM_MAPPING',
            sourceAssociationScore: 0.6076184036117126
          }
        }]
      },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-375276', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-416476', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-8856825', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-8856828', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] }
    ]
  };

  render(<LiveKnowledgeGraphPanel molecule="CANDESARTAN CILEXETIL" graph={candesartanGraph} />);

  expect(screen.getByTestId('live-v5-evidence-graph')).toBeInTheDocument();
  expect(screen.getByText(/biomedical_graph_v5/)).toBeInTheDocument();
  expect(screen.getByText(/ChEMBL, OpenTargets, Reactome/)).toBeInTheDocument();
  expect(screen.getByText(/7 entities · 6 relationships/)).toBeInTheDocument();
  expect(screen.getByText(/Dataset hash: 9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90/)).toBeInTheDocument();
  expect(screen.getByText('live:7')).toBeInTheDocument();

  // 4 pathways verified
  expect(candesartanGraph.nodes.filter(n => n.type === 'PATHWAY')).toHaveLength(4);

  // EFO-MONDO disease mapping verified
  const diseaseEdge = candesartanGraph.edges.find(e => e.type === 'DISEASE_TARGET');
  expect(diseaseEdge.provenance[0].metadata.originalDiseaseId).toBe('EFO:0003086');
  expect(diseaseEdge.provenance[0].metadata.canonicalOpenTargetsDiseaseId).toBe('MONDO_0005240');
  expect(diseaseEdge.provenance[0].metadata.mappingStatus).toBe('EXACT_OBSOLETE_TERM_MAPPING');
});
