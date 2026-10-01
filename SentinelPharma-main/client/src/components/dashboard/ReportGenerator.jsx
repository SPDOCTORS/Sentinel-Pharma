/**
 * SentinelPharma PDF Report Generator Component
 * ==========================================
 * One-click generation of Investment Brief in PDF format.
 * 
 * Features:
 * - Full report PDF generation
 * - Customizable sections
 * - Professional formatting
 * - Download functionality
 */

import { useState } from 'react';
import { 
  FileDown, 
  Loader2, 
  FileText, 
  CheckCircle2,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const ReportGenerator = ({ 
  results, 
  molecule,
  mode = 'cloud' 
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [selectedSections, setSelectedSections] = useState({
    executive_summary: true,
    clinical_analysis: true,
    patent_landscape: true,
    market_analysis: true,
    knowledge_graph: true,
    risk_assessment: true,
    recommendations: true,
    citations: true
  });

  const sections = [
    { id: 'executive_summary', label: 'Executive Summary', required: true },
    { id: 'clinical_analysis', label: 'Clinical Trial Analysis', required: false },
    { id: 'patent_landscape', label: 'Patent Landscape', required: false },
    { id: 'market_analysis', label: 'Market & ROI Analysis', required: false },
    { id: 'knowledge_graph', label: 'Knowledge Graph Insights', required: false },
    { id: 'risk_assessment', label: 'Risk Assessment', required: false },
    { id: 'recommendations', label: 'Recommendations', required: false },
    { id: 'citations', label: 'Source Citations', required: false },
  ];

  const toggleSection = (sectionId) => {
    const section = sections.find(s => s.id === sectionId);
    if (section?.required) return;
    
    setSelectedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const generatePDFContent = () => {
    // Build HTML content for PDF
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const dataMode = results?.dataMode || 'UNAVAILABLE';
    const verificationStatus = results?.verificationStatus || 'NOT_AVAILABLE';
    const provenanceDescriptions = {
      SOURCE_BACKED: 'Source-backed records; source identity does not establish clinical validity.',
      MODEL_PREDICTION: 'Model prediction; not verified biomedical evidence or a clinical-success probability.',
      DEMO_SYNTHETIC: 'Synthetic demonstration; claims, scores and recommendations are simulated.',
      UNAVAILABLE: 'Requested evidence is unavailable; no substitute evidence was generated.'
    };

    if (results?.researchMode === 'live') {
      const sourceResults = results?.results?.sourceResults || {};
      const citations = results?.citations || results?.results?.citations || [];
      const prediction = results?.results?.modelPrediction || {};
      const sourceRows = [['pubmed', 'PubMed'], ['clinicalTrials', 'ClinicalTrials.gov']].map(([key, name]) => {
        const source = sourceResults[key] || {};
        return `<li><strong>${name}:</strong> ${source.dataMode === 'SOURCE_BACKED' ? `${source.count ?? 0} source-backed records (retrieved ${escapeHtml(source.retrievedAt || 'unknown')})` : `Unavailable — ${escapeHtml(source.unavailableReason?.message || 'No source data available')}`}</li>`;
      }).join('');
      const citationRows = citations.map((citation) => {
        const url = /^https:\/\//i.test(citation.sourceUrl || '') ? citation.sourceUrl : null;
        const label = escapeHtml(citation.sourceName || citation.claim || citation.sourceId || 'Source record');
        return `<li>${url ? `<a href="${escapeHtml(url)}">${label}</a>` : label} — ${escapeHtml(citation.sourceId || '')} (${escapeHtml(citation.retrievedAt || 'retrieval time unavailable')})</li>`;
      }).join('');
      const candidates = (prediction.candidates || []).map((candidate) => `<li>${escapeHtml(candidate.drugName || candidate.drug || candidate.name || 'Unknown candidate')} — model score ${escapeHtml(candidate.score ?? candidate.predictionScore ?? 'unavailable')}</li>`).join('');
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Research Evidence Report — ${escapeHtml(molecule)}</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:40px auto;line-height:1.5;color:#182334}section{margin:26px 0}li{margin:8px 0}small{color:#596579}</style></head><body>
        <h1>Research Evidence Report — ${escapeHtml(molecule)}</h1>
        <small>Report ID: ${escapeHtml(results?.requestId || 'N/A')} | Generated: ${escapeHtml(results?.generatedAt || reportDate)} | Evidence contract: ${escapeHtml(results?.evidenceContractVersion || 'not supplied')}</small>
        <section><h2>Provenance</h2><p>${escapeHtml(dataMode)} / ${escapeHtml(verificationStatus)}. ${escapeHtml(provenanceDescriptions[dataMode] || provenanceDescriptions.UNAVAILABLE)}</p></section>
        <section><h2>Summary</h2><p>${escapeHtml(results?.results?.summary?.overallAssessment || 'No summary available.')}</p></section>
        <section><h2>Live sources</h2><ul>${sourceRows}</ul></section>
        <section><h2>GNN candidate ranking</h2><p>${prediction.dataMode === 'MODEL_PREDICTION' ? 'Model prediction; not verified clinical evidence or a probability of success.' : escapeHtml(prediction.unavailableReason?.message || 'Ranking unavailable.')}</p>${candidates ? `<ol>${candidates}</ol>` : ''}</section>
        <section><h2>Source records</h2>${citationRows ? `<ol>${citationRows}</ol>` : '<p>No source-backed records available.</p>'}</section>
        </body></html>`;
    }

    let content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SentinelPharma Investment Brief - ${molecule}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1a1a1a;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 3px solid #3B82F6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 28px;
      color: #1F2937;
      margin-bottom: 8px;
    }
    
    .header .subtitle {
      font-size: 18px;
      color: #6B7280;
    }
    
    .meta {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: #9CA3AF;
      margin-top: 15px;
    }
    
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    
    .section h2 {
      font-size: 18px;
      color: #3B82F6;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
    }
    
    .section h3 {
      font-size: 14px;
      color: #374151;
      margin: 15px 0 10px;
    }
    
    .section p {
      font-size: 13px;
      color: #4B5563;
      margin-bottom: 10px;
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 15px 0;
    }
    
    .metric-card {
      background: #F9FAFB;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    
    .metric-value {
      font-size: 24px;
      font-weight: 700;
      color: #1F2937;
    }
    
    .metric-label {
      font-size: 11px;
      color: #6B7280;
      margin-top: 4px;
    }
    
    .recommendation-badge {
      display: inline-block;
      padding: 8px 16px;
      background: #10B981;
      color: white;
      font-weight: 600;
      border-radius: 20px;
      font-size: 14px;
    }
    
    .recommendation-badge.buy { background: #10B981; }
    .recommendation-badge.hold { background: #F59E0B; }
    .recommendation-badge.review { background: #EF4444; }
    
    .risk-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px;
      background: #FEF3C7;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    
    .citation {
      font-size: 11px;
      color: #6B7280;
      padding: 8px;
      background: #F3F4F6;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      font-size: 11px;
      color: #9CA3AF;
      text-align: center;
    }
    
    @media print {
      body { padding: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Investment Brief: ${molecule}</h1>
    <div class="subtitle">Drug Repurposing Analysis Report</div>
    <div class="meta">
      <span>Generated: ${reportDate}</span>
      <span>Mode: ${mode === 'secure' ? 'Secure (Local)' : 'Cloud (Gemini)'}</span>
      <span>Report ID: ${escapeHtml(results?.requestId || results?.request_id || 'N/A')}</span>
    </div>
  </div>
  <div class="section">
    <h2>Evidence &amp; Provenance</h2>
    <p><strong>${escapeHtml(dataMode)}</strong> / ${escapeHtml(verificationStatus)}</p>
    <p>${escapeHtml(provenanceDescriptions[dataMode] || provenanceDescriptions.UNAVAILABLE)}</p>
    <p>Evidence contract: v${escapeHtml(results?.evidenceContractVersion || 'not supplied')}</p>
  </div>
`;

    // Executive Summary
    if (selectedSections.executive_summary) {
      const recommendation = results?.results?.market?.recommendation || 'REVIEW';
      const badgeClass = recommendation.includes('BUY') ? 'buy' : 
                        recommendation === 'HOLD' ? 'hold' : 'review';
      
      content += `
  <div class="section">
    <h2>Executive Summary</h2>
    <p>
      This report presents a comprehensive analysis of <strong>${molecule}</strong> 
      for drug repurposing opportunities, examining clinical evidence, intellectual property 
      landscape, market potential, and associated risks.
    </p>
    <div style="text-align: center; margin: 20px 0;">
      <span class="recommendation-badge ${badgeClass}">${recommendation.replace('_', ' ')}</span>
    </div>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">$${results?.results?.market?.projected_revenue_millions || 0}M</div>
        <div class="metric-label">Projected Revenue</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${results?.results?.market?.roi_percentage || 0}%</div>
        <div class="metric-label">ROI</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${results?.results?.market?.time_to_market_years || 0} yrs</div>
        <div class="metric-label">Time to Market</div>
      </div>
    </div>
  </div>
`;
    }

    // Clinical Analysis
    if (selectedSections.clinical_analysis && results?.results?.clinical) {
      const clinical = results.results.clinical;
      content += `
  <div class="section">
    <h2>Clinical Trial Analysis</h2>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${clinical.total_trials_found || 0}</div>
        <div class="metric-label">Total Trials</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${clinical.safety_score || 'N/A'}/10</div>
        <div class="metric-label">Safety Score</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${clinical.efficacy_rating || 'N/A'}</div>
        <div class="metric-label">Efficacy Rating</div>
      </div>
    </div>
    <h3>Current Indications</h3>
    <p>${clinical.current_indications?.join(', ') || 'Data not available'}</p>
    <h3>Potential New Indications</h3>
    <p>${clinical.potential_new_indications?.join(', ') || 'Data not available'}</p>
  </div>
`;
    }

    // Patent Landscape
    if (selectedSections.patent_landscape && results?.results?.patent) {
      const patent = results.results.patent;
      content += `
  <div class="section">
    <h2>Patent Landscape</h2>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${patent.active_patents || 0}</div>
        <div class="metric-label">Active Patents</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${patent.freedom_to_operate || 'N/A'}</div>
        <div class="metric-label">FTO Status</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${patent.earliest_expiration || 'N/A'}</div>
        <div class="metric-label">Earliest Expiration</div>
      </div>
    </div>
    <h3>Key Patent Holders</h3>
    <p>${patent.key_patent_holders?.map(h => h.company).join(', ') || 'Data not available'}</p>
  </div>
`;
    }

    // Market Analysis
    if (selectedSections.market_analysis && results?.results?.market) {
      const market = results.results.market;
      content += `
  <div class="section">
    <h2>Market & ROI Analysis</h2>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">$${market.market_size_billions || 0}B</div>
        <div class="metric-label">Market Size</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${market.probability_of_success || 'N/A'}</div>
        <div class="metric-label">Success Probability</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${market.competitive_landscape || 'N/A'}</div>
        <div class="metric-label">Competition</div>
      </div>
    </div>
    <h3>Investment Thesis</h3>
    <p>${market.investment_thesis || 'Data not available'}</p>
  </div>
`;
    }

    // Risk Assessment
    if (selectedSections.risk_assessment && results?.results?.validation) {
      const validation = results.results.validation;
      content += `
  <div class="section">
    <h2>Risk Assessment</h2>
    <h3>Identified Risks</h3>
    ${(validation.risk_flags || []).map(risk => `
      <div class="risk-item">${risk}</div>
    `).join('')}
    <h3>Data Quality Score</h3>
    <p>${Math.round((validation.data_quality_score || 0.8) * 100)}%</p>
    <h3>Overall Confidence</h3>
    <p>${validation.overall_confidence || 'MEDIUM'}</p>
  </div>
`;
    }

    // Recommendations
    if (selectedSections.recommendations) {
      const recommendations = Array.isArray(results?.results?.recommendation_dossier)
        ? results.results.recommendation_dossier
        : [];
      content += `
  <div class="section">
    <h2>Recommendations</h2>
    ${recommendations.length ? `<ul style="margin-left: 20px; margin-top: 10px;">${recommendations.map((item) => `
      <li style="margin-bottom: 8px;"><strong>${escapeHtml(item.title)}</strong><br />
      Provenance: ${escapeHtml(item.dataMode || 'UNAVAILABLE')} / ${escapeHtml(item.verificationStatus || 'NOT_AVAILABLE')}</li>
    `).join('')}</ul>` : '<p>No recommendation with explicit provenance is available.</p>'}
  </div>
`;
    }

    // Citations
    if (selectedSections.citations) {
      const citations = (Array.isArray(results?.results?.citations) ? results.results.citations : [])
        .filter((item) => item?.dataMode === 'SOURCE_BACKED' && item?.retrievedAt && (item?.sourceId || item?.sourceUrl));
      content += `
  <div class="section">
    <h2>Source Citations</h2>
    ${citations.length ? citations.map((item) => `<div class="citation">
      <strong>${escapeHtml(item.sourceId || item.id)}</strong> - ${escapeHtml(item.claim || 'Untitled source record')}<br />
      Retrieved: ${escapeHtml(item.retrievedAt)} · ${escapeHtml(item.verificationStatus || 'UNVERIFIED_SOURCE')}
    </div>`).join('') : '<p>No source-backed citations are available for this report.</p>'}
  </div>
`;
    }

    // Footer
    content += `
  <div class="footer">
    <p>Generated by SentinelPharma AI Platform | © 2024 SentinelPharma. All rights reserved.</p>
    <p>This report is for informational purposes only and should not be considered investment advice.</p>
  </div>
</body>
</html>
`;

    return content;
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    setDownloadComplete(false);

    try {
      // Simulate generation delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate PDF content
      const htmlContent = generatePDFContent();

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      // Open in new tab for printing/saving as PDF
      const printWindow = window.open(url, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          // Note: Users can use browser's "Save as PDF" in print dialog
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };
      }

      // Also offer direct HTML download
      const link = document.createElement('a');
      link.href = url;
      link.download = `SentinelPharma_Report_${molecule}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadComplete(true);
      
      // Reset after delay
      setTimeout(() => {
        setDownloadComplete(false);
      }, 3000);

    } catch (error) {
      console.error('Report generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!results) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-blue-600" />
          {results?.researchMode === 'live' ? 'Research Evidence Report' : 'Investment Brief Report'}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          {results?.researchMode === 'live' ? 'Download the source-backed research record and separate model ranking' : 'Generate a comprehensive PDF report for stakeholders'}
        </p>
      </div>

      <div className="p-4">
        {/* Options Toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors mb-4"
        >
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Report Options</span>
          </div>
          {showOptions ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {/* Section Selection */}
        {showOptions && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700 mb-3">
              Include Sections
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sections.map(section => (
                <label 
                  key={section.id}
                  className={`flex items-center space-x-2 p-2 rounded cursor-pointer ${
                    section.required ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSections[section.id]}
                    onChange={() => toggleSection(section.id)}
                    disabled={section.required}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{section.label}</span>
                  {section.required && (
                    <span className="text-xs text-gray-400">(Required)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerateReport}
          disabled={isGenerating}
          className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center space-x-2 ${
            isGenerating
              ? 'bg-gray-400 cursor-not-allowed'
              : downloadComplete
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generating Report...</span>
            </>
          ) : downloadComplete ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>Report Downloaded!</span>
            </>
          ) : (
            <>
              <FileDown className="w-5 h-5" />
              <span>{results?.researchMode === 'live' ? 'Generate Research Report' : 'Generate Investment Brief'}</span>
            </>
          )}
        </button>

        {/* Info Text */}
        <p className="text-xs text-gray-500 text-center mt-3">
          Report will open in a new tab. Use your browser&apos;s &quot;Save as PDF&quot; option.
        </p>
      </div>
    </div>
  );
};

export default ReportGenerator;
