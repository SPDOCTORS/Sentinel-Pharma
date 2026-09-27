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
    verificationStatus: 'VERIFIED_SOURCE', metadata: { authors: ['Ada Lovelace'], journal: 'Example Journal' }
  }] }} />);

  expect(screen.getByText('Metformin in pancreatic cancer')).toBeInTheDocument();
  expect(screen.getByText('12345678')).toBeInTheDocument();
});
