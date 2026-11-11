import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import V6RepurposingPanel from './V6RepurposingPanel';

const mockCandidate = (rank, isTwoHopConnected = true, isKnownIndication = false) => ({
  rank,
  drug: {
    id: `CHEMBL:CHEMBL${1000 + rank}`,
    name: `DrugCandidate_${rank}`
  },
  rankingScore: 0.52 - rank * 0.01,
  logit: 0.07 - rank * 0.02,
  scoreSemantics: 'UNCALIBRATED_RELATIVE_RANKING_SCORE',
  isTwoHopConnected,
  sharedTargetCount: isTwoHopConnected ? 2 : 0,
  sharedTargets: isTwoHopConnected
    ? [
        {
          targetId: 'ENSG00000102755',
          targetName: 'CYP3A4',
          drugRelationType: 'CURATED_MECHANISM',
          drugTargetWeight: 0.95,
          diseaseAssociationScore: 0.8,
          pathContribution: 0.76
        },
        {
          targetId: 'ENSG00000160868',
          targetName: 'CYP3A5',
          drugRelationType: 'BIOACTIVITY',
          drugTargetWeight: 0.85,
          diseaseAssociationScore: 0.75,
          pathContribution: 0.6375
        }
      ]
    : [],
  isKnownIndication,
  candidateStatus: isKnownIndication ? 'KNOWN_INDICATION' : 'UNOBSERVED_CANDIDATE',
  indicationStatus: isKnownIndication ? 'RECORDED_IN_CURATED_LABELS' : 'ABSENT_FROM_CURATED_LABELS',
  indicationProvenance: isKnownIndication
    ? 'RECORDED_IN_CURATED_GRAPH: Present in reference indication datasets.'
    : 'ABSENT_FROM_CURATED_GRAPH: Absent from curated reference indication datasets; does not denote therapeutic novelty.',
  structuralEvidenceCategory: 'COMPUTATIONAL_GRAPH_EVIDENCE',
  dataMode: 'MODEL_PREDICTION',
  provenance: {
    model: 'SentinelPharma-V6-ConnectivityAwareHybrid',
    checkpoint: 'best_model_weights.pt',
    checkpointSeed: 42
  },
  features: {
    twoHopScore: isTwoHopConnected ? 0.85 : 0.0,
    diseasePopularity: 0.47,
    rGcnScore: 0.62,
    interactionTerm: isTwoHopConnected ? 0.527 : 0.0
  }
});

const mockV6RepurposeResponse = (topK = 3) => ({
  data: {
    success: true,
    dataMode: 'MODEL_PREDICTION',
    verificationStatus: 'EXPERIMENTAL_UNVALIDATED',
    disease: {
      id: 'EFO:0000180',
      name: 'HIV-1 infection',
      trainingPopularity: 47
    },
    totalCandidatesScored: 6057,
    candidatesReturned: topK,
    topK,
    candidates: [
      mockCandidate(1, true, true), // Connected, Curated
      mockCandidate(2, true, false), // Connected, Unobserved
      mockCandidate(3, false, false) // Disconnected, Unobserved
    ].slice(0, topK)
  }
});

const mockV6StatusResponse = () => ({
  data: {
    ready: true,
    service: 'SentinelPharma-V6-Connectivity-Aware-Ranking-API',
    dataMode: 'MODEL_PREDICTION',
    verificationStatus: 'EXPERIMENTAL_UNVALIDATED',
    manifest: {
      manifestVersion: 'v6-locked-final-test-evaluation-manifest-v1'
    },
    biomedicalGraph: {
      numEntities: 12985,
      numRelations: 109007,
      numDrugs: 6057,
      numDiseases: 2605
    },
    model: {
      architecture: 'Connectivity-Aware Bilinear Interaction Logistic Hybrid Ranker',
      checkpoint: { seed: 42 }
    }
  }
});

const mockCandidateEvidenceResponse = () => ({
  data: {
    success: true,
    dataMode: 'MODEL_PREDICTION',
    candidateEvidence: {
      candidate: 'DrugCandidate_1',
      evidenceLinks: [
        {
          evidenceId: 'PMID:31000123',
          sourceType: 'PUBMED',
          linkStatus: 'DIRECT_MATCH',
          relationshipType: 'DRUG_DISEASE_CO_MENTION'
        },
        {
          evidenceId: 'NCT:NCT09876543',
          sourceType: 'CLINICALTRIALS_GOV',
          linkStatus: 'DIRECT_MATCH',
          relationshipType: 'CLINICAL_TRIAL_MATCH'
        }
      ]
    },
    literatureEvidence: [
      {
        id: 'PMID:31000123',
        pmid: '31000123',
        title: 'Evaluation of DrugCandidate_1 in clinical contexts',
        journal: 'J Antimicrob Chemother',
        year: 2021,
        authors: ['Smith J', 'Doe A']
      }
    ],
    clinicalTrialEvidence: [
      {
        id: 'NCT:NCT09876543',
        sourceId: 'NCT09876543',
        claim: 'Phase 3 safety and efficacy trial of DrugCandidate_1',
        metadata: {
          overallStatus: 'COMPLETED',
          phases: ['PHASE3'],
          hasResults: true
        },
        sourceUrl: 'https://clinicaltrials.gov/study/NCT09876543'
      }
    ]
  }
});

const createMockService = () => ({
  v6Status: jest.fn().mockResolvedValue(mockV6StatusResponse()),
  v6Repurpose: jest.fn().mockResolvedValue(mockV6RepurposeResponse(3)),
  v6CandidatePair: jest.fn(),
  getCandidateEvidence: jest.fn().mockResolvedValue(mockCandidateEvidenceResponse())
});

const renderPanel = async (service, onInvestigateCandidate = null, investigatingCandidate = null) => {
  let rendered;
  await act(async () => {
    rendered = render(
      <V6RepurposingPanel
        service={service}
        onInvestigateCandidate={onInvestigateCandidate}
        investigatingCandidate={investigatingCandidate}
      />
    );
  });
  return rendered;
};

describe('V6RepurposingPanel Component', () => {
  test('renders panel header, disclaimer notice, and input controls', async () => {
    const service = createMockService();
    await renderPanel(service);

    expect(
      screen.getByRole('heading', { name: /V6 Connectivity-Aware Hybrid Drug Repurposing/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/V6 Locked Evaluation Model/i)).toBeInTheDocument();

    // Experimental Disclaimer (Compact with expandable details)
    expect(
      screen.getByText(/Experimental Research System · Model Predictions Only/i)
    ).toBeInTheDocument();
    
    // Expand disclaimer details
    const detailsBtn = screen.getByRole('button', { name: /Details/i });
    expect(detailsBtn).toBeInTheDocument();
    fireEvent.click(detailsBtn);

    expect(
      screen.getByText(/Uncalibrated Relative Ranking Scores:/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Curated Labels Semantics:/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Computational Graph Evidence:/i)
    ).toBeInTheDocument();

    // Controls
    expect(screen.getByLabelText(/Disease Name or Canonical ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Top Candidates/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rank Candidates/i })).toBeInTheDocument();
    expect(screen.getByText(/Filter curated reference indications/i)).toBeInTheDocument();
  });

  test('executes candidate ranking and renders candidate table with relative scores and badges', async () => {
    const service = createMockService();
    await renderPanel(service);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    await waitFor(() => {
      expect(service.v6Repurpose).toHaveBeenCalledWith('EFO:0000180', 10, false);
    });

    // Query Summary Stats
    expect(screen.getAllByText(/HIV-1 infection/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Total Candidate Pool:/i)).toBeInTheDocument();
    expect(screen.getByText(/6,057 drugs/i)).toBeInTheDocument();

    // Table Content
    expect(screen.getByText('DrugCandidate_1')).toBeInTheDocument();
    expect(screen.getByText('DrugCandidate_2')).toBeInTheDocument();
    expect(screen.getByText('DrugCandidate_3')).toBeInTheDocument();

    // Indication Badges
    expect(screen.getByText('Curated Reference')).toBeInTheDocument();
    expect(screen.getAllByText('Unobserved in Graph')).toHaveLength(2);

    // Connectivity Badges
    expect(screen.getAllByText(/Connected \(2 targets\)/i)).toHaveLength(2);
    expect(screen.getByText(/Disconnected \(0 targets\)/i)).toBeInTheDocument();
  });

  test('inspects candidate evidence: displays shared targets and model feature decomposition', async () => {
    const service = createMockService();
    await renderPanel(service);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('DrugCandidate_1')).toBeInTheDocument();
    });

    // Click "Inspect" button for candidate 1
    const inspectButtons = screen.getAllByRole('button', { name: /Inspect/i });
    await act(async () => {
      fireEvent.click(inspectButtons[0]);
    });

    // Check shared-target computational evidence
    expect(screen.getByText(/Computational Graph Evidence Paths/i)).toBeInTheDocument();
    expect(screen.getByText('CYP3A4')).toBeInTheDocument();
    expect(screen.getByText('CYP3A5')).toBeInTheDocument();
    expect(screen.getByText('Curated Mechanism')).toBeInTheDocument();

    // Check feature decomposition
    expect(screen.getByText(/Model Feature Decomposition/i)).toBeInTheDocument();
    expect(screen.getByText(/2-Hop Direct Score/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Disease Popularity/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/R-GCN Embedding Score/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Interaction Term/i).length).toBeGreaterThanOrEqual(1);
  });

  test('toggles exclude_known_indications and passes flag to API', async () => {
    const service = createMockService();
    await renderPanel(service);

    const filterCheckbox = screen.getByLabelText(/Filter curated reference indications/i);
    fireEvent.click(filterCheckbox);
    expect(filterCheckbox).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    expect(service.v6Repurpose).toHaveBeenCalledWith('EFO:0000180', 10, true);
  });

  test('handles 404 unsupported disease gracefully with clear error message', async () => {
    const service = createMockService();
    service.v6Repurpose.mockRejectedValue({
      response: {
        status: 404,
        data: {
          error: "Unsupported disease: 'UNKNOWN_DISEASE' was not found in the frozen V6 biomedical graph."
        }
      }
    });

    await renderPanel(service);

    fireEvent.change(screen.getByLabelText(/Disease Name or Canonical ID/i), {
      target: { value: 'UNKNOWN_DISEASE' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Query Resolution Error/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/UNKNOWN_DISEASE/i);
  });

  test('investigate action opens candidate dossier with literature, clinical trials, and 3D evidence', async () => {
    const service = createMockService();
    await renderPanel(service);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('DrugCandidate_1')).toBeInTheDocument();
    });

    // Click "Investigate" button for candidate 1
    const investigateButtons = screen.getAllByRole('button', { name: /Investigate candidate/i });
    expect(investigateButtons.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(investigateButtons[0]);
    });

    // Verifies getCandidateEvidence was called
    await waitFor(() => {
      expect(service.getCandidateEvidence).toHaveBeenCalledWith(
        'DrugCandidate_1',
        'HIV-1 infection',
        expect.any(Number),
        10
      );
    });

    // Verifies dossier header and literature & clinical trial contents
    expect(screen.getByText(/Investigation dossier for pair:/i)).toBeInTheDocument();
    expect(screen.getByText(/PubMed Literature \(1 records\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Evaluation of DrugCandidate_1 in clinical contexts/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct Co-mention/i)).toBeInTheDocument();
    expect(screen.getByText(/PMID: 31000123/i)).toBeInTheDocument();

    expect(screen.getByText(/ClinicalTrials.gov \(1 records\)/i)).toBeInTheDocument();
    expect(screen.getByText(/NCT09876543/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct Study Match/i)).toBeInTheDocument();
    expect(screen.getByText(/COMPLETED/i)).toBeInTheDocument();

    // Switch to 3D structure tab
    const structureTab = screen.getByRole('button', { name: /Verified 3D Structure/i });
    await act(async () => {
      fireEvent.click(structureTab);
    });

    // Verifies 3D structure viewer renders with explicit UNAVAILABLE status preserved
    expect(screen.getByText(/Structure UNAVAILABLE/i)).toBeInTheDocument();
  });

  test('triggers onInvestigateCandidate with canonical identifiers when Launch Full Live Investigation is clicked', async () => {
    const service = createMockService();
    const mockInvestigate = jest.fn();
    await renderPanel(service, mockInvestigate);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank Candidates/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('DrugCandidate_1')).toBeInTheDocument();
    });

    // Expand candidate dossier
    const investigateButtons = screen.getAllByRole('button', { name: /Investigate candidate/i });
    await act(async () => {
      fireEvent.click(investigateButtons[0]);
    });

    // Click "Launch Full Live Investigation"
    const launchBtn = screen.getByRole('button', { name: /Launch Full Live Investigation/i });
    expect(launchBtn).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(launchBtn);
    });

    expect(mockInvestigate).toHaveBeenCalledWith(
      expect.objectContaining({
        drug: 'DrugCandidate_1',
        drugName: 'DrugCandidate_1',
        drugId: 'CHEMBL:CHEMBL1001',
        canonicalDrugId: 'CHEMBL:CHEMBL1001',
        disease: 'HIV-1 infection',
        diseaseName: 'HIV-1 infection',
        diseaseId: 'EFO:0000180',
        canonicalDiseaseId: 'EFO:0000180',
        score: expect.any(Number)
      }),
      'HIV-1 infection'
    );
  });
});
