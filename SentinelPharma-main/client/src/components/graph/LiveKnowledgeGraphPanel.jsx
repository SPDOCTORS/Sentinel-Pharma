import { AlertCircle, Database, ShieldCheck } from 'lucide-react';

import EvidenceModeBadge from '../ui/EvidenceModeBadge';
import KnowledgeGraphEnhanced from './KnowledgeGraphEnhanced';

const LiveKnowledgeGraphPanel = ({ graph, molecule }) => {
  const available = graph?.dataMode === 'SOURCE_BACKED'
    && graph?.verificationStatus === 'VERIFIED_SOURCE'
    && Array.isArray(graph?.nodes)
    && graph.nodes.length > 0
    && Array.isArray(graph?.edges)
    && graph.edges.length > 0;

  if (!available) {
    return (
      <section className="research-result-empty min-h-64" data-testid="live-graph-unavailable">
        <AlertCircle className="h-6 w-6" />
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <strong>V5 evidence graph unavailable</strong>
            <EvidenceModeBadge dataMode="UNAVAILABLE" verificationStatus="NOT_AVAILABLE" />
          </div>
          <p>{graph?.unavailableReason?.message || 'No exact, source-backed V5 drug-target-disease neighborhood is available for this request.'}</p>
          <p className="mt-2 text-xs">No generated or demonstration graph is substituted in live research.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="live-v5-evidence-graph">
      <div className="research-result-summary">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--research-evidence)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-[var(--research-ink)]">Frozen V5 source relationships</strong>
            <EvidenceModeBadge dataMode={graph.dataMode} verificationStatus={graph.verificationStatus} />
          </div>
          <p className="mt-1 text-xs text-[var(--research-muted)]">
            {graph.graphDatasetVersion} · {graph.sources?.join(', ') || 'Source provenance attached'} · {graph.nodes.length} entities · {graph.edges.length} relationships
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-[var(--research-muted)]" title={graph.graphDatasetHash}>
            Dataset hash: {graph.graphDatasetHash}
          </p>
        </div>
        <Database className="h-5 w-5 shrink-0 text-[var(--research-muted)]" />
      </div>
      <KnowledgeGraphEnhanced molecule={molecule} graphData={graph} researchMode="live" />
    </section>
  );
};

export default LiveKnowledgeGraphPanel;
