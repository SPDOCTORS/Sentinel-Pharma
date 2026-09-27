import React from 'react';
import { render, screen } from '@testing-library/react';
import AgentDetailPanel from '../components/dashboard/AgentDetailPanel';

test('does not invent literature when Web Intelligence supplies no evidence', () => {
  render(<AgentDetailPanel agent={{ name: 'Web Intelligence Agent' }} data={{}} molecule="Aspirin" onClose={() => {}} />);
  expect(screen.getByText('No source-backed literature evidence is available.')).toBeInTheDocument();
  expect(screen.queryByText(/Long-term efficacy and safety/)).not.toBeInTheDocument();
});
