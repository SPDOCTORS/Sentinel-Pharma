/**
 * SentinelPharma Synthetic Query Library
 * ===================================
 * Pre-filled strategic questions for drug repurposing research.
 * These simulate complex pharma intelligence queries that exercise
 * multiple agents and demonstrate the platform's capabilities.
 */

/**
 * Strategic query categories for the dropdown selector
 */
export const QUERY_CATEGORIES = {
  REPURPOSING: 'Drug Repurposing Candidates',
  MARKET: 'Market Intelligence',
  CLINICAL: 'Clinical Development',
  PATENT: 'Patent Strategy',
  SUPPLY_CHAIN: 'Supply Chain & Trade',
  COMPETITIVE: 'Competitive Analysis',
  REGULATORY: 'Regulatory Landscape',
  KOL: 'Key Opinion Leaders'
};

/**
 * Synthetic Query Library
 * Each query is designed to trigger specific agent combinations
 */
export const SYNTHETIC_QUERIES = [
  // ==================
  // REPURPOSING QUERIES
  // ==================
  {
    id: 'sq-001',
    category: 'REPURPOSING',
    title: 'Metformin Cancer Repurposing',
    molecule: 'Metformin',
    query: 'Analyze metformin\'s potential for repurposing in oncology, specifically colorectal and breast cancer. Include ongoing clinical trials, mechanism of action through AMPK pathway, patent landscape for new formulations, and market opportunity vs existing diabetes market.',
    expectedAgents: ['clinical', 'patent', 'market', 'pathfinder'],
    complexity: 'high',
    icon: '🔬'
  },
  {
    id: 'sq-002',
    category: 'REPURPOSING',
    title: 'Thalidomide Multiple Myeloma',
    molecule: 'Thalidomide',
    query: 'Evaluate thalidomide derivatives (lenalidomide, pomalidomide) for multiple myeloma treatment. Analyze clinical efficacy data, safety monitoring requirements, competitive positioning against CAR-T therapies, and generic entry timeline.',
    expectedAgents: ['clinical', 'patent', 'market', 'validation'],
    complexity: 'high',
    icon: '💊'
  },
  {
    id: 'sq-003',
    category: 'REPURPOSING',
    title: 'Sildenafil Pulmonary Hypertension',
    molecule: 'Sildenafil',
    query: 'Assess sildenafil (Revatio) market position in pulmonary arterial hypertension. Compare efficacy vs. newer endothelin receptor antagonists, patent status, pediatric indication opportunities, and pricing strategy in specialty pharmacy.',
    expectedAgents: ['clinical', 'market', 'patent', 'iqvia'],
    complexity: 'medium',
    icon: '🫀'
  },
  
  // ==================
  // MARKET INTELLIGENCE
  // ==================
  {
    id: 'sq-004',
    category: 'MARKET',
    title: 'GLP-1 Agonist Market Analysis',
    molecule: 'Semaglutide',
    query: 'Comprehensive market analysis of GLP-1 agonists for obesity and diabetes. Include Ozempic/Wegovy market share, supply constraints, competitor pipeline (Lilly\'s tirzepatide), pricing pressure, and 5-year CAGR projections.',
    expectedAgents: ['market', 'iqvia', 'clinical', 'exim'],
    complexity: 'high',
    icon: '📊'
  },
  {
    id: 'sq-005',
    category: 'MARKET',
    title: 'Biosimilar Adalimumab Competition',
    molecule: 'Adalimumab',
    query: 'Analyze Humira biosimilar landscape post-patent expiry. Compare Amjevita, Hadlima, Hyrimoz market penetration, payer formulary preferences, interchangeability status, and impact on AbbVie\'s market share.',
    expectedAgents: ['market', 'patent', 'iqvia', 'validation'],
    complexity: 'high',
    icon: '💉'
  },
  
  // ==================
  // CLINICAL DEVELOPMENT
  // ==================
  {
    id: 'sq-006',
    category: 'CLINICAL',
    title: 'Psilocybin Depression Trials',
    molecule: 'Psilocybin',
    query: 'Map all active clinical trials for psilocybin in treatment-resistant depression. Identify key investigators, regulatory pathways (FDA Breakthrough Therapy), COMPASS Pathways competitive position, and reimbursement challenges.',
    expectedAgents: ['clinical', 'kol', 'market', 'web_intel'],
    complexity: 'high',
    icon: '🧠'
  },
  {
    id: 'sq-007',
    category: 'CLINICAL',
    title: 'CRISPR Sickle Cell Therapy',
    molecule: 'Exa-cel',
    query: 'Evaluate CRISPR-based therapies for sickle cell disease. Compare Vertex/CRISPR\'s exa-cel vs. bluebird bio gene therapy, manufacturing scalability, pricing at $1-2M per treatment, and patient access programs.',
    expectedAgents: ['clinical', 'market', 'patent', 'validation'],
    complexity: 'high',
    icon: '🧬'
  },
  
  // ==================
  // PATENT STRATEGY
  // ==================
  {
    id: 'sq-008',
    category: 'PATENT',
    title: 'Keytruda Patent Cliff Analysis',
    molecule: 'Pembrolizumab',
    query: 'Analyze Keytruda (pembrolizumab) patent portfolio and lifecycle management strategies. Identify biosimilar entry timeline, Merck\'s new indication patents, subcutaneous formulation IP, and revenue erosion projections 2028-2035.',
    expectedAgents: ['patent', 'market', 'clinical', 'iqvia'],
    complexity: 'high',
    icon: '📜'
  },
  {
    id: 'sq-009',
    category: 'PATENT',
    title: 'mRNA Vaccine IP Landscape',
    molecule: 'mRNA-1273',
    query: 'Map the mRNA technology patent landscape covering Moderna and BioNTech/Pfizer. Include LNP delivery patents, manufacturing process claims, freedom-to-operate analysis for new entrants, and litigation risks.',
    expectedAgents: ['patent', 'market', 'validation', 'internal'],
    complexity: 'high',
    icon: '💎'
  },
  
  // ==================
  // SUPPLY CHAIN & TRADE
  // ==================
  {
    id: 'sq-010',
    category: 'SUPPLY_CHAIN',
    title: 'API Sourcing India-China Analysis',
    molecule: 'Ibuprofen',
    query: 'Analyze ibuprofen API global supply chain. Compare India vs. China manufacturing costs, quality compliance (FDA warning letters), trade policy impacts, supply disruption risks, and alternative sourcing strategies.',
    expectedAgents: ['exim', 'market', 'validation', 'web_intel'],
    complexity: 'medium',
    icon: '🚢'
  },
  {
    id: 'sq-011',
    category: 'SUPPLY_CHAIN',
    title: 'Antibiotic Supply Security',
    molecule: 'Amoxicillin',
    query: 'Assess antibiotic supply chain vulnerability for amoxicillin and clavulanate. Map global manufacturing sites, raw material dependencies, shortage history, and strategic stockpile recommendations.',
    expectedAgents: ['exim', 'clinical', 'market', 'web_intel'],
    complexity: 'medium',
    icon: '🏭'
  },
  
  // ==================
  // COMPETITIVE ANALYSIS
  // ==================
  {
    id: 'sq-012',
    category: 'COMPETITIVE',
    title: 'JAK Inhibitor Safety Comparison',
    molecule: 'Tofacitinib',
    query: 'Compare JAK inhibitors (tofacitinib, baricitinib, upadacitinib) safety profiles post-FDA boxed warning. Analyze cardiovascular risk data, prescribing trends, payer restrictions, and competitive positioning strategies.',
    expectedAgents: ['clinical', 'market', 'validation', 'kol'],
    complexity: 'high',
    icon: '⚖️'
  },
  {
    id: 'sq-013',
    category: 'COMPETITIVE',
    title: 'Alzheimer\'s Antibody Pipeline',
    molecule: 'Lecanemab',
    query: 'Competitive landscape analysis for anti-amyloid antibodies in Alzheimer\'s. Compare Leqembi (lecanemab) vs. donanemab efficacy, safety (ARIA), pricing, and Medicare coverage determination impact.',
    expectedAgents: ['clinical', 'market', 'iqvia', 'kol'],
    complexity: 'high',
    icon: '🧓'
  },
  
  // ==================
  // REGULATORY LANDSCAPE
  // ==================
  {
    id: 'sq-014',
    category: 'REGULATORY',
    title: 'NASH Drug Approval Pathway',
    molecule: 'Resmetirom',
    query: 'Analyze FDA approval pathway for NASH therapies. Evaluate resmetirom (Madrigal) Phase 3 data, surrogate endpoint acceptance, competitive pipeline status, and potential first-mover advantage timeline.',
    expectedAgents: ['clinical', 'market', 'validation', 'web_intel'],
    complexity: 'high',
    icon: '🏛️'
  },
  {
    id: 'sq-015',
    category: 'REGULATORY',
    title: 'Accelerated Approval Conversion',
    molecule: 'Aducanumab',
    query: 'Review FDA accelerated approvals requiring confirmatory trials. Focus on aducanumab (Aduhelm) case study, withdrawal risks, and implications for future neurological drug development strategies.',
    expectedAgents: ['clinical', 'market', 'validation', 'web_intel'],
    complexity: 'medium',
    icon: '⚡'
  },
  
  // ==================
  // KEY OPINION LEADERS
  // ==================
  {
    id: 'sq-016',
    category: 'KOL',
    title: 'Obesity KOL Network Mapping',
    molecule: 'Tirzepatide',
    query: 'Identify top 20 Key Opinion Leaders in obesity medicine for GLP-1/GIP dual agonist launch. Map publication networks, clinical trial involvement, advisory board participation, and social media influence.',
    expectedAgents: ['kol', 'clinical', 'web_intel', 'internal'],
    complexity: 'medium',
    icon: '👨‍⚕️'
  },
  {
    id: 'sq-017',
    category: 'KOL',
    title: 'Gene Therapy Thought Leaders',
    molecule: 'Zolgensma',
    query: 'Map gene therapy KOL ecosystem for rare disease applications. Identify researchers, clinician advocates, patient advocacy connections, and regulatory engagement history for SMA treatment development.',
    expectedAgents: ['kol', 'clinical', 'patent', 'web_intel'],
    complexity: 'medium',
    icon: '🔬'
  }
];

/**
 * Get queries by category
 */
export const getQueriesByCategory = (category) => {
  return SYNTHETIC_QUERIES.filter(q => q.category === category);
};

/**
 * Get all unique molecules from queries
 */
export const getUniqueMolecules = () => {
  return [...new Set(SYNTHETIC_QUERIES.map(q => q.molecule))];
};

/**
 * Get queries by complexity level
 */
export const getQueriesByComplexity = (complexity) => {
  return SYNTHETIC_QUERIES.filter(q => q.complexity === complexity);
};

/**
 * Get query by ID
 */
export const getQueryById = (id) => {
  return SYNTHETIC_QUERIES.find(q => q.id === id);
};

/**
 * Format query for display in dropdown
 */
export const formatQueryOption = (query) => ({
  value: query.id,
  label: `${query.icon} ${query.title}`,
  molecule: query.molecule,
  category: QUERY_CATEGORIES[query.category],
  complexity: query.complexity
});

/**
 * Get all formatted options for dropdown
 */
export const getAllQueryOptions = () => {
  return SYNTHETIC_QUERIES.map(formatQueryOption);
};

/**
 * Get grouped options by category for grouped dropdown
 */
export const getGroupedQueryOptions = () => {
  const grouped = {};
  
  Object.entries(QUERY_CATEGORIES).forEach(([key, label]) => {
    grouped[label] = getQueriesByCategory(key).map(formatQueryOption);
  });
  
  return grouped;
};

export default SYNTHETIC_QUERIES;
