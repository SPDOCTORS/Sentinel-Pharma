import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ResearchDashboard from './ResearchDashboard';
import { researchService } from '../services/api';

jest.mock('../services/api', () => ({
  researchService: {
    analyze: jest.fn(),
    discoverRepurposing: jest.fn(),
    getCandidateEvidence: jest.fn()
  }
}));

jest.mock('../context/ResearchContext', () => ({ useResearch: () => ({ privacyMode: 'cloud' }) }));
jest.mock('../context/ModelContext', () => ({ useModel: () => ({ selectedModel: 'test-model' }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Researcher', role: 'researcher' } }) }));

jest.mock('../components/ui/WorkspacePanel', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/dashboard/AutoSuggestInput', () => ({ value, onChange }) => (
  <input aria-label="Molecule input" value={value} onChange={(event) => onChange(event.target.value)} />
));
jest.mock('../components/dashboard/RepurposingDiscoveryPanel', () => ({ onInvestigateCandidate }) => (
  <button type="button" onClick={() => onInvestigateCandidate({ drug: 'Candidate A', target: 'TARGET1', interaction: { dataMode: 'UNAVAILABLE' } }, 'Disease X')}>
    Select Candidate A
  </button>
));
jest.mock('../components/dashboard/ExperimentalRepurposingExplorer', () => () => null);
jest.mock('../components/dashboard/EmbeddedMoleculeViewer', () => ({ molecule, target }) => <div>Structure check for {molecule} / {target}</div>);
jest.mock('../components/graph/LiveKnowledgeGraphPanel', () => ({ molecule, graph }) => <div>V5 graph for {molecule}: {graph.graphDatasetVersion}</div>);
jest.mock('../components/dashboard/ReportGenerator', () => () => null);
jest.mock('../components/dashboard/BenchmarkProductPanel', () => () => null);
jest.mock('../components/dashboard/ComprehensiveSummary', () => () => null);

test('investigates a ranked candidate and disease through the existing live evidence workspace', async () => {
  researchService.analyze.mockResolvedValue({
    data: {
      requestId: 'request-1',
      researchMode: 'live',
      molecule: 'Candidate A',
      disease: 'Disease X',
      results: {
        sourceResults: {
          pubmed: { success: true, count: 1, dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE' },
          clinicalTrials: { success: true, count: 2, dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE' }
        },
        modelPrediction: { dataMode: 'UNAVAILABLE', candidates: [] },
        knowledge_graph: { dataMode: 'SOURCE_BACKED', graphDatasetVersion: 'biomedical_graph_v5' }
      }
    }
  });

  render(<MemoryRouter><ResearchDashboard /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Select Candidate A' }));

  await waitFor(() => expect(researchService.analyze).toHaveBeenCalledWith(
    'Candidate A',
    'cloud',
    'test-model',
    'Disease X',
    'live'
  ));
  expect(await screen.findByText('Named biomedical sources')).toBeInTheDocument();
  expect(screen.getByText('Structure check for Candidate A / TARGET1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /V5 Evidence Graph/i }));
  expect(screen.getByText('V5 graph for Candidate A: biomedical_graph_v5')).toBeInTheDocument();
});
