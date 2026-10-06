import { render, screen } from '@testing-library/react';

import ComprehensiveSummary from './ComprehensiveSummary';

test('keeps hook order stable when agent results become available', () => {
  const { container, rerender } = render(<ComprehensiveSummary agentResults={null} molecule="Candidate A" />);
  expect(container).toBeEmptyDOMElement();

  rerender(<ComprehensiveSummary agentResults={{}} molecule="Candidate A" />);
  expect(screen.getByText('Executive Summary')).toBeInTheDocument();
});
