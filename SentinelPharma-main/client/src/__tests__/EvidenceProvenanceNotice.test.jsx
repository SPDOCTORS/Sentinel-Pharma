import React from 'react';
import { render, screen } from '@testing-library/react';
import EvidenceProvenanceNotice from '../components/ui/EvidenceProvenanceNotice';

test.each([
  ['SOURCE_BACKED', 'Source-backed evidence', 'Records were retrieved from named external sources'],
  ['MODEL_PREDICTION', 'Model prediction', 'model-ranked inference'],
  ['DEMO_SYNTHETIC', 'Demo / synthetic', 'synthetic demonstration'],
  ['UNAVAILABLE', 'Unavailable', 'No substitute evidence was generated']
])('visibly distinguishes %s results', (dataMode, badge, description) => {
  render(<EvidenceProvenanceNotice payload={{ dataMode, evidenceContractVersion: '1.0' }} />);
  expect(screen.getByText(badge)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(description, 'i'))).toBeInTheDocument();
  expect(screen.getByText('Evidence contract v1.0')).toBeInTheDocument();
});

test('shows the structured reason for unavailable data', () => {
  render(<EvidenceProvenanceNotice payload={{
    dataMode: 'UNAVAILABLE', unavailableReason: { code: 'SOURCE_DOWN', message: 'Source timed out.' }
  }} />);
  expect(screen.getByText('Reason: Source timed out.')).toBeInTheDocument();
});
