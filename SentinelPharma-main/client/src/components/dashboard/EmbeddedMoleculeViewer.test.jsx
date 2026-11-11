import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EmbeddedMoleculeViewer from './EmbeddedMoleculeViewer';

const verifiedStructure = {
  pdbId: '4ABC', drug: 'Candidate A', target: 'TARGET1', dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE',
  mappingStatus: 'VERIFIED', mappingMethod: 'VERIFIED_DRUG_TARGET_COMPLEX',
  provenance: { source: 'RCSB PDB', sourceRecordId: '4ABC', sourceUrl: 'https://www.rcsb.org/structure/4ABC', retrievedAt: '2026-10-05T00:00:00Z' }
};

test('loads only a verified candidate-target PDB mapping with provenance', () => {
  render(<EmbeddedMoleculeViewer molecule="Candidate A" target="TARGET1" structureMapping={verifiedStructure} />);
  const viewer = screen.getByTitle('Interactive PDB structure 4ABC for Candidate A');
  expect(viewer).toHaveAttribute('src', expect.stringContaining('pdb=4ABC'));
  expect(screen.getByRole('link', { name: /Open RCSB PDB/i })).toHaveAttribute('href', 'https://www.rcsb.org/structure/4ABC');
  expect(screen.getByText(/Mapping source: RCSB PDB, record 4ABC/)).toBeInTheDocument();
  fireEvent.load(viewer);
  expect(screen.queryByText('Loading verified archive structure')).not.toBeInTheDocument();
});

test('rejects a bare PDB identifier without mapping provenance', () => {
  render(<EmbeddedMoleculeViewer molecule="Candidate A" target="TARGET1" structureMapping={{ pdbId: '1HSG' }} />);
  expect(screen.getByText('Structure UNAVAILABLE')).toBeInTheDocument();
  expect(screen.queryByTitle(/Interactive PDB structure/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Open RCSB PDB/i })).not.toBeInTheDocument();
});

test('rejects a mapping whose candidate identity does not match', () => {
  render(<EmbeddedMoleculeViewer molecule="Different candidate" target="TARGET1" structureMapping={verifiedStructure} />);
  expect(screen.getByText('Structure UNAVAILABLE')).toBeInTheDocument();
  expect(screen.queryByTitle(/Interactive PDB structure/i)).not.toBeInTheDocument();
});

test('displays the backend unavailable reason without generating geometry', () => {
  render(<EmbeddedMoleculeViewer molecule="Candidate A" target="TARGET1" structureMapping={{ dataMode: 'UNAVAILABLE', verificationStatus: 'NOT_AVAILABLE', unavailableReason: { message: 'No verified structure mapping exists.' } }} />);
  expect(screen.getByText('Structure UNAVAILABLE')).toBeInTheDocument();
  expect(screen.getByText('No verified structure mapping exists.')).toBeInTheDocument();
  expect(screen.queryByTitle(/Interactive PDB structure/i)).not.toBeInTheDocument();
});

test('renders Mol* viewer iframe and RCSB provenance for verified Nirmatrelvir complex 7VH8', () => {
  const nirmatrelvirMapping = {
    pdbId: '7VH8',
    drug: 'Nirmatrelvir',
    target: 'SARSCoV2_MPRO',
    dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE',
    mappingStatus: 'VERIFIED',
    mappingMethod: 'VERIFIED_DRUG_TARGET_COMPLEX',
    provenance: {
      source: 'RCSB PDB',
      sourceRecordId: '7VH8',
      sourceUrl: 'https://www.rcsb.org/structure/7VH8',
      retrievedAt: '2026-10-09T03:07:00Z',
    },
  };

  render(
    <EmbeddedMoleculeViewer
      molecule="Nirmatrelvir"
      target="SARSCoV2_MPRO"
      structureMapping={nirmatrelvirMapping}
    />
  );

  const viewer = screen.getByTitle('Interactive PDB structure 7VH8 for Nirmatrelvir');
  expect(viewer).toHaveAttribute(
    'src',
    'https://molstar.org/viewer/?pdb=7VH8&pdb-provider=rcsb&collapse-left-panel=1&hide-controls=0'
  );
  expect(screen.getByRole('link', { name: /Open RCSB PDB/i })).toHaveAttribute(
    'href',
    'https://www.rcsb.org/structure/7VH8'
  );
  expect(screen.getByText(/Mapping source: RCSB PDB, record 7VH8/)).toBeInTheDocument();
  expect(screen.getByText('Verified mapping')).toBeInTheDocument();
  fireEvent.load(viewer);
  expect(screen.queryByText('Loading verified archive structure')).not.toBeInTheDocument();
});

