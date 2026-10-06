import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RepurposingDiscoveryPanel from '../components/dashboard/RepurposingDiscoveryPanel';

jest.mock('../components/dashboard/EmbeddedMoleculeViewer', () => () => <div />);

test('renders source-provided trial status without calling completion successful', () => {
  const candidate = { drug: 'Metformin', target: 'AMPK', score: 0.72, rationale: 'Model output', evidenceTrail: [], interaction: {} };
  const onInvestigateCandidate = jest.fn();
  render(<RepurposingDiscoveryPanel disease="Pancreatic Cancer" setDisease={() => {}} onSubmit={(event) => event.preventDefault()} loading={false} error={null}
    data={{ disease: 'Pancreatic Cancer', model: 'test', dataMode: 'MODEL_PREDICTION', candidates: [candidate] }}
    candidateEvidence={{ Metformin: { candidateEvidence: { evidenceSummary: { pubmedCount: 1, clinicalTrialCount: 1 } }, clinicalTrialEvidence: [{ sourceId: 'NCT01234567', claim: 'Study title', sourceUrl: 'https://clinicaltrials.gov/study/NCT01234567', metadata: { overallStatus: 'COMPLETED', phases: ['PHASE2'], hasResults: true } }] } }}
    onInvestigateCandidate={onInvestigateCandidate}
  />);
  expect(screen.getByText(/NCT01234567/)).toBeInTheDocument();
  expect(screen.getByText(/COMPLETED/)).toBeInTheDocument();
  expect(screen.queryByText(/SUCCESSFUL/)).not.toBeInTheDocument();
  expect(screen.getByText('Open ClinicalTrials.gov source')).toHaveAttribute('href', 'https://clinicaltrials.gov/study/NCT01234567');
  expect(screen.getByText('Disease-Conditioned Existing-Drug Candidates for Pancreatic Cancer')).toBeInTheDocument();
  expect(screen.getByText('Only the disease input affects this GraphSAGE ranking.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Investigate candidate + disease' }));
  expect(onInvestigateCandidate).toHaveBeenCalledWith(candidate, 'Pancreatic Cancer');
});
