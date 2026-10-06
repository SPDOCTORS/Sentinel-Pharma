/**
 * SentinelPharma Citation System Component
 * =====================================
 * Zero-trust citation system with hover-to-verify functionality.
 * 
 * Features:
 * - Hover-to-verify AI-generated text
 * - Source linking to PubMed/ClinicalTrials.gov
 * - Citation sidebar viewer
 * - Explainability for AI claims
 */

import { useState, useRef } from 'react';
import { 
  ExternalLink, 
  FileText, 
  BookOpen, 
  CheckCircle2, 
  AlertCircle,
  Info,
  X,
  ChevronRight,
  Database
} from 'lucide-react';
import EvidenceModeBadge from '../ui/EvidenceModeBadge';

const isTraceableSource = (citation) => citation?.dataMode === 'SOURCE_BACKED' &&
  Boolean(citation?.retrievedAt) && Boolean(citation?.sourceId || citation?.sourceUrl);

// Citable text component with hover functionality
export const CitableText = ({ 
  text, 
  citations = [], 
  onCitationClick,
  confidenceScore = null 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const textRef = useRef(null);

  const hasCitations = citations && citations.length > 0;
  const confidence = confidenceScore;

  return (
    <span 
      ref={textRef}
      className={`relative inline ${hasCitations ? 'cursor-pointer' : ''}`}
      onMouseEnter={() => {
        setIsHovered(true);
        if (hasCitations) setShowTooltip(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowTooltip(false);
      }}
    >
      <span className={`
        ${hasCitations ? 'border-b-2 border-dotted' : ''}
        ${isHovered && hasCitations ? 'bg-blue-50 border-blue-400' : 'border-gray-300'}
        transition-all
      `}>
        {text}
      </span>

      {/* Citation indicator */}
      {hasCitations && (
        <sup className="text-xs text-blue-600 ml-0.5 font-medium">
          [{citations.length}]
        </sup>
      )}

      {/* Hover tooltip */}
      {showTooltip && hasCitations && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">
              {citations.length} Source{citations.length > 1 ? 's' : ''}
            </span>
            {confidence !== null && <div className={`flex items-center text-xs ${
              confidence >= 0.8 ? 'text-green-600' : confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {confidence >= 0.8 ? (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              ) : (
                <AlertCircle className="w-3 h-3 mr-1" />
              )}
              {Math.round(confidence * 100)}% confidence
            </div>}
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {citations.map((citation, index) => (
              <button
                key={index}
                onClick={() => onCitationClick && onCitationClick(citation)}
                className="w-full text-left p-2 bg-gray-50 hover:bg-blue-50 rounded text-xs transition-colors"
              >
                <div className="flex items-start space-x-2">
                  <Database className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {citation.claim || citation.title || citation.sourceId || citation.id}
                    </div>
                    <div className="text-gray-500">
                      {(citation.sourceType === 'PUBMED' || citation.type === 'pubmed') && `PubMed · ${citation.publishedAt || citation.year || ''}`}
                      {citation.type === 'clinicaltrials' && `ClinicalTrials.gov · ${citation.phase}`}
                      {citation.type === 'patent' && `Patent · ${citation.assignee}`}
                    </div>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
            Click to view source details
          </div>
        </div>
      )}
    </span>
  );
};

// Citation Sidebar Component
export const CitationSidebar = ({ 
  isOpen, 
  onClose, 
  citation
}) => {
  if (!isOpen || !citation) return null;

  const getTypeIcon = () => {
    switch (citation.type) {
      case 'pubmed': return <BookOpen className="w-5 h-5 text-blue-600" />;
      case 'clinicaltrials': return <FileText className="w-5 h-5 text-green-600" />;
      case 'patent': return <FileText className="w-5 h-5 text-purple-600" />;
      default: return <Database className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTypeBadge = () => {
    switch (citation.type) {
      case 'pubmed': return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'PubMed' };
      case 'clinicaltrials': return { bg: 'bg-green-100', text: 'text-green-700', label: 'Clinical Trial' };
      case 'patent': return { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Patent' };
      case 'market_report': return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Market Report' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Source' };
    }
  };

  const badge = getTypeBadge();

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-slate-800 shadow-2xl z-50 flex flex-col animate-slide-in-right border-l border-gray-200 dark:border-slate-600">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getTypeIcon()}
          <h3 className="font-semibold text-gray-900 dark:text-white">Source Verification</h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Source Badge */}
        <div className={`inline-flex items-center px-3 py-1 rounded-full ${badge.bg} ${badge.text} text-sm font-medium mb-4`}>
          {badge.label}
        </div>

        {/* Title */}
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {citation.claim || citation.title}
        </h4>

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          {(citation.metadata?.authors || citation.authors) && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Authors:</span> {Array.isArray(citation.metadata?.authors) ? citation.metadata.authors.join(', ') : citation.authors}
            </div>
          )}
          {(citation.metadata?.journal || citation.journal) && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Journal:</span> {citation.metadata?.journal || citation.journal}
            </div>
          )}
          {citation.sponsor && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Sponsor:</span> {citation.sponsor}
            </div>
          )}
          {citation.assignee && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Assignee:</span> {citation.assignee}
            </div>
          )}
          {citation.year && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Year:</span> {citation.year}
            </div>
          )}
          {citation.phase && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Phase:</span> {citation.phase}
            </div>
          )}
          {citation.status && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Status:</span> {citation.status}
            </div>
          )}
        </div>

        {/* Relevance Score */}
        {citation.relevance && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Relevance Score</span>
              <span className="text-sm font-bold text-blue-600">
                {Math.round(citation.relevance * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${citation.relevance * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Highlighted Excerpt */}
        {citation.excerpt && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
            <div className="flex items-center mb-2">
              <Info className="w-4 h-4 text-yellow-600 mr-2" />
              <span className="text-sm font-medium text-yellow-800">Relevant Excerpt</span>
            </div>
            <p className="text-sm text-gray-700 italic">
              &ldquo;{citation.excerpt}&rdquo;
            </p>
          </div>
        )}

        {/* Source Link */}
        {(citation.sourceUrl || citation.url) && (
          <a
            href={citation.sourceUrl || citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
          >
            <div className="flex items-center space-x-2">
              <ExternalLink className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">View Original Source</span>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
          </a>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>{citation.verificationStatus === 'VERIFIED_SOURCE'
            ? 'Source identity verified; scientific validity has not been established.'
            : 'Source record is unverified; scientific validity has not been established.'}</span>
        </div>
      </div>
    </div>
  );
};

// Main Citation Panel Component
const CitationPanel = ({ 
  agentResults,
  onViewCitation 
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Aggregate citations from all agent results
  const getAllCitations = () => {
    if (Array.isArray(agentResults?.citations) && agentResults.citations.length > 0) {
      return agentResults.citations.filter(isTraceableSource);
    }

    return [];
  };

  const citations = getAllCitations();
  const filteredCitations = selectedCategory === 'all' 
    ? citations 
    : citations.filter(c => c.type === selectedCategory ||
      (selectedCategory === 'pubmed' && c.sourceType === 'PUBMED') ||
      (selectedCategory === 'clinicaltrials' && c.sourceType === 'CLINICALTRIALS_GOV'));

  return (
    <div className="research-citation-panel">
      <div className="border-b border-[var(--research-border)] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
        <p className="research-eyebrow">Provenance ledger</p>
        <h3 className="flex items-center text-lg font-semibold text-[var(--research-ink)]">
          <BookOpen className="mr-2 h-5 w-5 text-[var(--research-primary)]" />
          Source Citations
        </h3>
        <p className="mt-1 text-sm text-[var(--research-muted)]">
          Trace source identifiers, retrieval timestamps, and backend verification status.
        </p>
          </div>
          <span className="research-count-label">{citations.length} traceable sources</span>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex space-x-2 overflow-x-auto border-b border-[var(--research-border)] bg-[var(--research-surface-muted)] px-4 py-2.5">
        {[
          { id: 'all', label: 'All Sources' },
          { id: 'pubmed', label: 'PubMed' },
          { id: 'clinicaltrials', label: 'Clinical Trials' },
          { id: 'patent', label: 'Patents' },
          { id: 'market_report', label: 'Market Reports' },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategory === cat.id
                ? 'border-[var(--research-border-strong)] bg-[var(--research-surface)] text-[var(--research-primary)]'
                : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Citations List */}
      <div className="max-h-[28rem] space-y-2 overflow-y-auto p-4">
        {filteredCitations.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No source-backed citations are available for this result.</p>
          </div>
        ) : (
          filteredCitations.map((citation, index) => (
            <button
              key={index}
              onClick={() => onViewCitation && onViewCitation(citation)}
              className="research-citation-row group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <EvidenceModeBadge dataMode={citation.dataMode} verificationStatus={citation.verificationStatus} />
                    <span className={`research-id-label ${
                      (citation.sourceType === 'PUBMED' || citation.type === 'pubmed') ? 'bg-blue-100 text-blue-700' :
                      (citation.sourceType === 'CLINICALTRIALS_GOV' || citation.type === 'clinicaltrials') ? 'bg-green-100 text-green-700' :
                      citation.type === 'patent' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {citation.sourceId || citation.id}
                    </span>
                    <span className="text-xs text-gray-400">{citation.publishedAt || citation.year}</span>
                  </div>
                  <div className="pr-4 text-sm font-semibold leading-5 text-[var(--research-ink)]">
                    {citation.claim || citation.title}
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-[var(--research-muted)]">
                    {Array.isArray(citation.metadata?.authors) ? citation.metadata.authors.join(', ') : (citation.authors || citation.sponsor || citation.assignee || citation.sourceName || citation.source)}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-[var(--research-muted)]">Retrieved {citation.retrievedAt}</div>
                </div>
                <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-[var(--research-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--research-primary)]" />
              </div>
              
              {/* Relevance bar */}
              {citation.relevance && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-xs text-[var(--research-muted)]">Relevance</span>
                  <div className="h-1.5 flex-1 rounded-full bg-[var(--research-border)]">
                    <div 
                        className="h-1.5 rounded-full bg-[var(--research-primary)]"
                      style={{ width: `${citation.relevance * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--research-ink)]">
                    {Math.round(citation.relevance * 100)}%
                  </span>
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--research-border)] bg-[var(--research-surface-muted)] p-4">
        <div className="flex flex-col gap-1 text-xs text-[var(--research-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>{citations.length} sources referenced</span>
          <span>Source verification status is supplied by the backend.</span>
        </div>
      </div>
    </div>
  );
};

export default CitationPanel;
