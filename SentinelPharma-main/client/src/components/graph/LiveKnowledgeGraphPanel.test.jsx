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
