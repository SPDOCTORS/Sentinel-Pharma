import React from 'react';
import { render, screen } from '@testing-library/react';
import CitationPanel from '../components/dashboard/CitationPanel';

test('does not fabricate citations when the backend supplies none', () => {
  render(<CitationPanel agentResults={{ clinical: {} }} />);

  expect(screen.getByText('No source-backed citations are available for this result.')).toBeInTheDocument();
  expect(screen.queryByText(/PMID:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/NCT\d/)).not.toBeInTheDocument();
});

test('renders backend-supplied PubMed metadata as a verified source', () => {
  render(<CitationPanel agentResults={{ citations: [{
    id: 'PMID:12345678', sourceId: '12345678', claim: 'Metformin in pancreatic cancer',
    sourceType: 'PUBMED', publishedAt: '2024', dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE', retrievedAt: '2026-01-01T00:00:00Z',
    metadata: { authors: ['Ada Lovelace'], journal: 'Example Journal' }
  }] }} />);

  expect(screen.getByText('Metformin in pancreatic cancer')).toBeInTheDocument();
  expect(screen.getByText('12345678')).toBeInTheDocument();
  expect(screen.getByText('Verified source record')).toBeInTheDocument();
});

test('rejects model outputs and incomplete source records from the citation list', () => {
  render(<CitationPanel agentResults={{ citations: [
    { claim: 'Predicted relationship', dataMode: 'MODEL_PREDICTION', sourceId: 'model-1', retrievedAt: '2026-01-01' },
    { claim: 'Missing retrieval time', dataMode: 'SOURCE_BACKED', sourceId: 'source-1' }
  ] }} />);

  expect(screen.getByText('No source-backed citations are available for this result.')).toBeInTheDocument();
  expect(screen.queryByText('Predicted relationship')).not.toBeInTheDocument();
  expect(screen.queryByText('Missing retrieval time')).not.toBeInTheDocument();
});
