import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ExperimentalRepurposingExplorer from './ExperimentalRepurposingExplorer';

const candidate = (rank) => ({
  candidate: { drug: { id: 'CHEMBL:CHEMBL1000', name: 'Cetirizine' }, disease: { id: `EFO:${rank}`, name: `Disease ${rank}` }, rank, modelScore: 0.485587, candidateStatus: 'UNOBSERVED_CANDIDATE', provenance: 'MODEL_PREDICTION' },
  model: { architecture: 'R-GCN', graphDatasetVersion: 'biomedical_graph_v4', graphDatasetHash: 'v4', checkpointHash: 'checkpoint', scoreSemantics: 'experimental model score; not probability' },
  structuralEvidence: { lookupStatus: 'AVAILABLE', supportStatus: 'NO_STRUCTURAL_SUPPORT', graphDatasetVersion: 'biomedical_graph_v5', sharedTargets: [], sharedTargetCount: 0, pathways: [] },
  externalEvidence: { pubmed: { dataMode: 'UNAVAILABLE', error: { code: 'NOT_REQUESTED' } }, clinicalTrials: { dataMode: 'UNAVAILABLE', error: { code: 'NOT_REQUESTED' } }, }, limitations: []
});

const createService = () => ({
  experimentalCandidates: jest.fn().mockResolvedValue({ data: { candidateCount: 10, candidates: Array.from({ length: 10 }, (_, index) => candidate(index + 1)) } }),
  experimentalKnownIndications: jest.fn().mockResolvedValue({ data: { indicationCount: 18, indications: Array.from({ length: 18 }, (_, index) => ({ disease: { id: `KNOWN:${index}`, name: `Known ${index}` } })) } }),
  experimentalCandidateDetail: jest.fn().mockResolvedValue({ data: candidate(1) }),
  experimentalEvidence: jest.fn().mockResolvedValue({ data: candidate(1) })
});

test('renders the research notice, keeps external evidence manual, and preserves backend candidate ordering', async () => {
  const service = createService();
  render(<ExperimentalRepurposingExplorer service={service} />);
  expect(screen.getByText(/Experimental · Research Use/)).toBeInTheDocument();
  expect(screen.getByText(/not probabilities/i)).toBeInTheDocument();
  expect(screen.queryByText('Search External Evidence')).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /load candidates/i })); });
  await waitFor(() => expect(screen.getByRole('heading', { name: /Experimental Repurposing Candidates/ })).toBeInTheDocument());
  expect(screen.getByRole('heading', { name: /Known Indications/ })).toBeInTheDocument();
  expect(screen.getByText(/#1 Disease 1/)).toBeInTheDocument();
  expect(screen.getByText(/#10 Disease 10/)).toBeInTheDocument();
  expect(screen.getAllByText(/Experimental model score:/)[0]).toHaveTextContent('0.485587');
  expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  expect(service.experimentalEvidence).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /#1 Disease 1/i })); });
  await waitFor(() => expect(service.experimentalCandidateDetail).toHaveBeenCalledWith('CHEMBL:CHEMBL1000', 'EFO:1'));
  const detail = screen.getByRole('complementary');
  expect(within(detail).getByText(/Structural lookup:/)).toHaveTextContent('Available');
  expect(within(detail).getByText(/Structural support:/)).toHaveTextContent('No direct structural support found');
  expect(within(detail).getByText('PubMed: Not searched')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /search external evidence/i })); });
  await waitFor(() => expect(service.experimentalEvidence).toHaveBeenCalledWith('CHEMBL:CHEMBL1000', 'EFO:1'));
});

test('shows a safe unknown-drug error without internal details', async () => {
  const service = createService();
  service.experimentalCandidates.mockRejectedValue({ response: { status: 404 } });
  render(<ExperimentalRepurposingExplorer service={service} />);
  fireEvent.change(screen.getByLabelText('Drug canonical ID'), { target: { value: 'UNKNOWN' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /load candidates/i })); });
  expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
  expect(screen.queryByText(/traceback/i)).not.toBeInTheDocument();
});
