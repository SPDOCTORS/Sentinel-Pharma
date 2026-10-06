import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkspacePanel from '../components/ui/WorkspacePanel';

test('renders a labelled research surface with actions and content', () => {
  render(
    <WorkspacePanel
      eyebrow="Live evidence"
      title="New research"
      description="Retrieve traceable source records."
      actions={<button type="button">Advanced options</button>}
    >
      <label htmlFor="molecule">Molecule</label>
      <input id="molecule" />
    </WorkspacePanel>
  );

  expect(screen.getByRole('heading', { name: 'New research' })).toBeInTheDocument();
  expect(screen.getByText('Live evidence')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Advanced options' })).toBeInTheDocument();
  expect(screen.getByLabelText('Molecule')).toBeInTheDocument();
});
