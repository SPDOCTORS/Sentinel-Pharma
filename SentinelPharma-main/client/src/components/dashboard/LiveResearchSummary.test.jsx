import { fireEvent, render, screen } from '@testing-library/react';

import LiveResearchSummary from './LiveResearchSummary';

const baseReport = {
  molecule: 'Evidence molecule',
  disease: 'Test disease',
  dataMode: 'SOURCE_BACKED',
  verificationStatus: 'VERIFIED_SOURCE',
  results: {
    sourceResults: {},
    modelPrediction: {
      dataMode: 'MODEL_PREDICTION',
      verificationStatus: 'MODEL_INFERENCE',
      candidates: [{ rank: 1, drug: 'Primary candidate', score: 0.51 }]
    }
  }
};

test('labels the frozen V5 result as a non-primary shadow ranking', () => {
  render(<LiveResearchSummary report={{
    ...baseReport,
    results: {
      ...baseReport.results,
      shadowModelPrediction: {
        dataMode: 'MODEL_PREDICTION',
        verificationStatus: 'MODEL_INFERENCE',
        shadow: true,
        primary: false,
        candidates: [{ rank: 1, drug: 'Shadow candidate', drugId: 'CHEMBL:1', score: 0.72 }],
        modelLineage: { graphDatasetVersion: 'biomedical_graph_v5' }
      }
    }
  }} view="rankings" />);

  expect(screen.getByText('Disease-conditioned GraphSAGE candidate ranking')).toBeInTheDocument();
  expect(screen.getByText('Primary candidate')).toBeInTheDocument();
  expect(screen.getByTestId('v5-shadow-ranking')).toBeInTheDocument();
  expect(screen.getByText('Disease-conditioned frozen V5 shadow ranking')).toBeInTheDocument();
  expect(screen.getByText('Not primary')).toBeInTheDocument();
  expect(screen.getByText('Shadow candidate')).toBeInTheDocument();
  expect(screen.getByText('biomedical_graph_v5')).toBeInTheDocument();
  expect(screen.getByText(/molecule entered in the evidence flow does not affect either ranking/i)).toBeInTheDocument();
  expect(screen.queryByText('Named biomedical sources')).not.toBeInTheDocument();
});

test('keeps a failed shadow ranking visible without changing the primary result', () => {
  render(<LiveResearchSummary report={{
    ...baseReport,
    results: {
      ...baseReport.results,
      shadowModelPrediction: {
        dataMode: 'UNAVAILABLE',
        verificationStatus: 'NOT_AVAILABLE',
        shadow: true,
        primary: false,
        unavailableReason: { code: 'V5_SHADOW_UNAVAILABLE', message: 'Frozen comparison unavailable.' }
      }
    }
  }} view="rankings" />);

  expect(screen.getByText('Primary candidate')).toBeInTheDocument();
  expect(screen.getByText('Frozen comparison unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('Shadow candidate')).not.toBeInTheDocument();
});

test('keeps source evidence separate from disease-first rankings', () => {
  render(<LiveResearchSummary report={{
    ...baseReport,
    results: {
      ...baseReport.results,
      sourceResults: {
        pubmed: {
          success: true,
          count: 2,
          dataMode: 'SOURCE_BACKED',
          verificationStatus: 'VERIFIED_SOURCE'
        }
      }
    }
  }} view="evidence" />);

  expect(screen.getByText('Named biomedical sources')).toBeInTheDocument();
  expect(screen.getByText('2 records retrieved')).toBeInTheDocument();
  expect(screen.queryByText('Disease-conditioned GraphSAGE candidate ranking')).not.toBeInTheDocument();
  expect(screen.queryByText('Primary candidate')).not.toBeInTheDocument();
});

test('opens the existing evidence investigation from a ranked candidate', () => {
  const onInvestigateCandidate = jest.fn();
  render(<LiveResearchSummary
    report={baseReport}
    view="rankings"
    onInvestigateCandidate={onInvestigateCandidate}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Investigate candidate + disease' }));
  expect(onInvestigateCandidate).toHaveBeenCalledWith(baseReport.results.modelPrediction.candidates[0]);
});
