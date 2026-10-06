import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Box, ExternalLink, FlaskConical, Info, Loader2, Maximize2, RefreshCw, X } from 'lucide-react';

const PDB_ID_PATTERN = /^[a-z0-9]{4}$/i;

const isVerifiedMapping = (mapping, molecule, target) => {
  const pdbId = String(mapping?.pdbId || '').trim().toUpperCase();
  const provenance = mapping?.provenance;
  return PDB_ID_PATTERN.test(pdbId)
    && mapping?.dataMode === 'SOURCE_BACKED'
    && mapping?.verificationStatus === 'VERIFIED_SOURCE'
    && mapping?.mappingStatus === 'VERIFIED'
    && Boolean(mapping?.mappingMethod)
    && String(mapping?.drug || '').toLowerCase() === String(molecule || '').toLowerCase()
    && String(mapping?.target || '').toLowerCase() === String(target || '').toLowerCase()
    && provenance?.source === 'RCSB PDB'
    && String(provenance?.sourceRecordId || '').toUpperCase() === pdbId
    && provenance?.sourceUrl === `https://www.rcsb.org/structure/${pdbId}`
    && Boolean(provenance?.retrievedAt);
};

const EmbeddedMoleculeViewer = ({ molecule, structureMapping, target }) => {
  const normalizedPdbId = String(structureMapping?.pdbId || '').trim().toUpperCase();
  const hasVerifiedMapping = isVerifiedMapping(structureMapping, molecule, target);
  const [status, setStatus] = useState(hasVerifiedMapping ? 'loading' : 'empty');
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const viewerUrl = useMemo(() => {
    if (!hasVerifiedMapping) return null;
    const params = new URLSearchParams({ pdb: normalizedPdbId, 'pdb-provider': 'rcsb', 'collapse-left-panel': '1', 'hide-controls': '0' });
    return `https://molstar.org/viewer/?${params.toString()}`;
  }, [hasVerifiedMapping, normalizedPdbId]);

  const rcsbUrl = hasVerifiedMapping ? structureMapping.provenance.sourceUrl : null;

  useEffect(() => {
    setStatus(hasVerifiedMapping ? 'loading' : 'empty');
    setReloadKey(0);
  }, [hasVerifiedMapping, normalizedPdbId]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const reloadViewer = () => {
    if (!hasVerifiedMapping) return;
    setStatus('loading');
    setReloadKey((key) => key + 1);
  };

  return (
    <section className={`structure-workspace ${isFullscreen ? 'structure-workspace--fullscreen' : ''}`} aria-label="Molecular structure workspace">
      <header className="structure-workspace__header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="structure-workspace__icon"><Box className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Structure workspace</p>
            <h5 className="truncate text-sm font-semibold text-slate-100">{molecule || 'Candidate structure'}</h5>
            <p className="truncate text-[11px] text-slate-400">{target ? `Candidate target: ${target}` : 'Target annotation unavailable'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasVerifiedMapping && <>
            <button type="button" onClick={reloadViewer} className="structure-control" aria-label="Reload structure viewer" title="Reload viewer"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" onClick={() => setIsFullscreen((value) => !value)} className="structure-control" aria-label={isFullscreen ? 'Exit fullscreen structure view' : 'Open fullscreen structure view'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
          </>}
        </div>
      </header>

      <div className={`structure-workspace__body ${isFullscreen ? 'structure-workspace__body--fullscreen' : ''}`}>
        {hasVerifiedMapping ? (
          <div className="relative h-full min-h-72 bg-[#07100f]">
            <iframe key={`${normalizedPdbId}-${reloadKey}`} src={viewerUrl} title={`Interactive PDB structure ${normalizedPdbId} for ${molecule || 'candidate'}`} className="h-full min-h-72 w-full border-0" onLoad={() => setStatus('ready')} onError={() => setStatus('error')} allow="fullscreen; clipboard-write" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads" />
            {status === 'loading' && <div className="structure-state structure-state--overlay" role="status"><Loader2 className="h-6 w-6 animate-spin text-teal-300" /><div><p className="font-semibold text-slate-100">Loading verified archive structure</p><p className="mt-1 text-xs text-slate-400">Requesting PDB {normalizedPdbId} in the Mol* viewer.</p></div></div>}
            {status === 'error' && <div className="structure-state structure-state--overlay" role="alert"><AlertTriangle className="h-6 w-6 text-amber-300" /><div><p className="font-semibold text-slate-100">Structure viewer unavailable</p><p className="mt-1 text-xs text-slate-400">The embedded viewer could not load. The verified PDB record can still be opened directly.</p><button type="button" onClick={reloadViewer} className="mt-3 structure-retry-button">Try again</button></div></div>}
          </div>
        ) : (
          <div className="structure-state"><FlaskConical className="h-7 w-7 text-slate-500" /><div><p className="font-semibold text-slate-200">Structure UNAVAILABLE</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{structureMapping?.unavailableReason?.message || 'No verified drug/target-to-PDB mapping with provenance is available. No molecular geometry has been generated or inferred.'}</p></div></div>
        )}
      </div>

      <footer className="structure-workspace__footer">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><span className={`structure-status-dot ${status === 'ready' ? 'structure-status-dot--ready' : ''}`} aria-hidden="true" /><span className="text-xs font-semibold text-slate-300">{hasVerifiedMapping ? `PDB ${normalizedPdbId}` : 'UNAVAILABLE'}</span>{hasVerifiedMapping && <span className="structure-reference-badge">Verified mapping</span>}</div>
        {rcsbUrl && <a href={rcsbUrl} target="_blank" rel="noreferrer" className="structure-source-link">Open RCSB PDB <ExternalLink className="h-3.5 w-3.5" /></a>}
      </footer>

      <div className="structure-disclaimer"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{hasVerifiedMapping ? `Mapping source: ${structureMapping.provenance.source}, record ${structureMapping.provenance.sourceRecordId}, retrieved ${structureMapping.provenance.retrievedAt}. Structural mapping does not establish therapeutic efficacy or clinical relevance.` : 'The viewer remains disabled until a verified candidate/target-to-PDB mapping with provenance is supplied.'}</span></div>
    </section>
  );
};

export default EmbeddedMoleculeViewer;
