import { render, screen } from '@testing-library/react';
import KnowledgeGraphEnhanced from './KnowledgeGraphEnhanced';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    rect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 50 })),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    clip: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    setLineDash: jest.fn()
  }));
  window.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
  window.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
});

test('KnowledgeGraphEnhanced renders 7 nodes, 6 edges, and 4 pathways for Candesartan Cilexetil', () => {
  const candesartanGraph = {
    dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE',
    graphDatasetVersion: 'biomedical_graph_v5',
    graphDatasetHash: '9b8adde39a0b47ee77412ad8f9be965bedb3b5a077e82492c3ddb12c96dc8f90',
    sources: ['ChEMBL', 'OpenTargets', 'Reactome'],
    nodes: [
      { id: 'CHEMBL:CHEMBL1014', label: 'CANDESARTAN CILEXETIL', type: 'DRUG' },
      { id: 'EFO:0003086', label: 'kidney disease', type: 'DISEASE' },
      { id: 'ENSEMBL:ENSG00000144891', label: 'ENSG00000144891', type: 'TARGET' },
      { id: 'REACTOME:R-HSA-375276', label: 'Peptide ligand-binding receptors', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-416476', label: 'G alpha (q) signalling events', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-8856825', label: 'Cargo recognition for clathrin-mediated endocytosis', type: 'PATHWAY' },
      { id: 'REACTOME:R-HSA-8856828', label: 'Clathrin-mediated endocytosis', type: 'PATHWAY' }
    ],
    edges: [
      {
        source: 'CHEMBL:CHEMBL1014',
        target: 'ENSEMBL:ENSG00000144891',
        type: 'DRUG_TARGET',
        provenance: [{ source: 'ChEMBL', metadata: { actionType: 'ANTAGONIST' } }]
      },
      {
        source: 'ENSEMBL:ENSG00000144891',
        target: 'EFO:0003086',
        type: 'DISEASE_TARGET',
        provenance: [{
          source: 'OpenTargets',
          metadata: {
            originalDiseaseId: 'EFO:0003086',
            canonicalOpenTargetsDiseaseId: 'MONDO_0005240',
            mappingStatus: 'EXACT_OBSOLETE_TERM_MAPPING',
            sourceAssociationScore: 0.6076184036117126
          }
        }]
      },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-375276', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-416476', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-8856825', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] },
      { source: 'ENSEMBL:ENSG00000144891', target: 'REACTOME:R-HSA-8856828', type: 'TARGET_PATHWAY', provenance: [{ source: 'Reactome' }] }
    ]
  };

  render(
    <KnowledgeGraphEnhanced
      molecule="CANDESARTAN CILEXETIL"
      graphData={candesartanGraph}
      researchMode="live"
    />
  );

  expect(screen.getByText('Biomedical knowledge graph')).toBeInTheDocument();
  expect(screen.getByText('Relationship explorer')).toBeInTheDocument();
  // Check entity filter counters
  expect(screen.getByText('All entities (7)')).toBeInTheDocument();
  expect(screen.getByText('Drugs (1)')).toBeInTheDocument();
  expect(screen.getByText('Genes / targets (1)')).toBeInTheDocument();
  expect(screen.getByText('Pathways (4)')).toBeInTheDocument();
  expect(screen.getByText('Diseases (1)')).toBeInTheDocument();
});
