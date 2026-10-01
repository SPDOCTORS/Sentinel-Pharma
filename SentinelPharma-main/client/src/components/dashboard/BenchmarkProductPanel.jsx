import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import {
  AlertTriangle,
  BadgeCheck,
  Beaker,
  BookOpen,
  Download,
  FileJson,
  FileText,
  FlaskConical,
  Microscope,
  ShieldAlert,
  Target,
  TrendingUp
} from 'lucide-react';
import EvidenceModeBadge from '../ui/EvidenceModeBadge';

const toneClass = {
  validated: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  simulated: 'border-rose-200 bg-rose-50 text-rose-800'
};

const safeFileToken = (value = 'benchmark-report') => (
  String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'benchmark-report'
);

const BenchmarkProductPanel = ({ agentResults, molecule }) => {
  const benchmark = agentResults?.benchmarking;
  const recommendations = agentResults?.recommendation_dossier || [];
  const retrospective = agentResults?.retrospective_case_studies || [];
  const validation = agentResults?.validation || {};
  const disclosure = agentResults?.simulation_disclosure || {};

  const exportPayload = useMemo(() => ({
    molecule,
    exported_at: new Date().toISOString(),
    simulation_disclosure: disclosure,
    validation,
    benchmarking: benchmark,
    recommendation_dossier: recommendations,
    retrospective_case_studies: retrospective
  }), [benchmark, disclosure, molecule, recommendations, retrospective, validation]);

  if (!agentResults) return null;

  const getLabelTone = (label = '') => {
    const normalized = label.toLowerCase();
    if (normalized.includes('partially')) return 'partial';
    if (normalized.includes('simulated')) return 'simulated';
    return 'validated';
  };

  const formatMetric = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return String(value);
  };

  const downloadBlob = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const filename = `sentinelpharma-benchmark-${safeFileToken(molecule)}.json`;
    downloadBlob(JSON.stringify(exportPayload, null, 2), filename, 'application/json');
  };

  const handleExportPdf = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 42;
    const lineHeight = 16;
    let y = margin;

    const addLine = (text = '', options = {}) => {
      const { size = 11, weight = 'normal', color = [31, 41, 55] } = options;
      pdf.setFont('helvetica', weight);
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(String(text), pageWidth - margin * 2);
      lines.forEach((line) => {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
      });
    };

    const addSectionGap = () => {
      y += 8;
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
    };

    addLine(`SentinelPharma Benchmark Report: ${molecule}`, { size: 18, weight: 'bold', color: [8, 47, 73] });
    addLine(`Generated: ${new Date().toLocaleString()}`, { size: 10, color: [71, 85, 105] });
    addLine(`Validation label: ${disclosure.label || 'SIMULATED_WITH_EVIDENCE'}`, { size: 10, color: [71, 85, 105] });
    addSectionGap();

    addLine('Benchmark Summary', { size: 14, weight: 'bold', color: [3, 105, 161] });
    (benchmark?.datasets || []).forEach((dataset) => {
      addLine(`${dataset.name}: ${formatMetric(dataset.score)} ${dataset.metric} | Baseline ${formatMetric(dataset.baseline)} | ${dataset.status}`);
    });
    addSectionGap();

    if (benchmark?.evaluationSummary) {
      addLine('Held-out Evaluation', { size: 14, weight: 'bold', color: [3, 105, 161] });
      addLine(`Holdout edges: ${benchmark.evaluationSummary.holdoutEdges}`);
      addLine(`Train edges: ${benchmark.evaluationSummary.trainEdges}`);
      addLine(`Epochs: ${benchmark.evaluationSummary.epochs}`);
      Object.entries(benchmark.evaluationSummary.metrics || {}).forEach(([name, value]) => {
        addLine(`${name}: ${formatMetric(value)}`);
      });
      addSectionGap();
    }

    if ((benchmark?.topEvaluatedCases || []).length > 0) {
      addLine('Top Evaluated Cases', { size: 14, weight: 'bold', color: [3, 105, 161] });
      benchmark.topEvaluatedCases.forEach((item, index) => {
        addLine(`${index + 1}. ${item.drug} -> ${item.disease} | Rank ${item.rank}`, { weight: 'bold' });
        (item.top_predictions || []).slice(0, 5).forEach((prediction) => {
          addLine(`   - ${prediction.disease}: ${formatMetric(prediction.score)}`);
        });
      });
      addSectionGap();
    }

    addLine('Recommendation Dossier', { size: 14, weight: 'bold', color: [3, 105, 161] });
    recommendations.forEach((item, index) => {
      addLine(`${index + 1}. ${item.title}`, { weight: 'bold' });
      addLine(`Provenance: ${item.dataMode || 'UNAVAILABLE'} / ${item.verificationStatus || 'NOT_AVAILABLE'}`);
      addLine(`Validation: ${item.validationLabel} | Confidence: ${formatMetric(item.confidence)}%`);
      addLine(`Evidence path: ${(item.evidencePath || []).join(' -> ')}`);
      addLine(`Uncertainty: ${item.uncertainty}`);
      addLine(`Contraindication: ${item.contraindication}`);
    });
    addSectionGap();

    addLine('Retrospective Cases', { size: 14, weight: 'bold', color: [3, 105, 161] });
    retrospective.forEach((study, index) => {
      addLine(`${index + 1}. ${study.title}`, { weight: 'bold' });
      addLine(`Surfaced before: ${study.surfacedBefore}`);
      addLine(`Evidence path: ${(study.evidencePath || []).join(' -> ')}`);
      addLine(`Takeaway: ${study.takeaway}`);
    });

    pdf.save(`sentinelpharma-benchmark-${safeFileToken(molecule)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-cyan-600" />
              Benchmark Product Layer
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Benchmarking, evidence-grounding, validation disclosure, and retrospective case design for {molecule}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className={`px-3 py-2 rounded-xl border text-sm font-semibold text-center ${toneClass[getLabelTone(disclosure.label)]}`}>
              {disclosure.label || 'SIMULATED_WITH_EVIDENCE'}
            </div>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <FileJson className="w-4 h-4" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm font-semibold hover:bg-cyan-500 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>

        {benchmark && (
          <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {benchmark.datasets?.map((dataset) => (
              <div key={dataset.name} className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-900/40">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{dataset.name}</div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{formatMetric(dataset.score)}</span>
                  <span className="text-xs text-slate-500">{dataset.metric}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Baseline: {formatMetric(dataset.baseline)}</div>
                <div className="text-xs text-slate-500">Split: {dataset.split}</div>
                <div className="mt-2 inline-flex rounded-full bg-cyan-100 text-cyan-800 px-2 py-1 text-[11px] font-medium">
                  {dataset.status}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 grid lg:grid-cols-2 gap-4">
          {benchmark?.provenance && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-900/40">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-600" />
                Benchmark Provenance
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                <div>Source: <strong>{benchmark.provenance.source}</strong></div>
                <div>Artifact ready: <strong>{String(benchmark.provenance.artifactReady)}</strong></div>
                <div>Training triples loaded: <strong>{benchmark.provenance.trainingTriplesLoaded ?? 0}</strong></div>
                <div>Evaluation loaded: <strong>{String(Boolean(benchmark.provenance.evaluationLoaded))}</strong></div>
                <div>Seed rows loaded: <strong>{benchmark.provenance.seedRowsLoaded ?? 0}</strong></div>
              </div>
              {benchmark.provenance.loadError && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  Load warning: {benchmark.provenance.loadError}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-900/40">
            <div className="font-semibold text-slate-900 dark:text-white">Graph Coverage Snapshot</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500">Drugs</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{benchmark?.graphStats?.uniqueDrugs ?? 0}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500">Diseases</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{benchmark?.graphStats?.uniqueDiseases ?? 0}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500">Targets</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{benchmark?.graphStats?.uniqueTargets ?? 0}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500">Relation Types</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{benchmark?.graphStats?.relationTypes ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        {benchmark?.evaluationSummary && (
          <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <div className="font-semibold text-cyan-950 flex items-center gap-2">
              <Microscope className="w-4 h-4" />
              Held-out Evaluation Summary
            </div>
            <div className="mt-3 grid md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-white p-3 border border-cyan-100">
                <div className="text-xs uppercase tracking-wide text-slate-500">Holdout Edges</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{benchmark.evaluationSummary.holdoutEdges}</div>
              </div>
              <div className="rounded-lg bg-white p-3 border border-cyan-100">
                <div className="text-xs uppercase tracking-wide text-slate-500">Train Edges</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{benchmark.evaluationSummary.trainEdges}</div>
              </div>
              <div className="rounded-lg bg-white p-3 border border-cyan-100">
                <div className="text-xs uppercase tracking-wide text-slate-500">Epochs</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{benchmark.evaluationSummary.epochs}</div>
              </div>
            </div>
            <div className="mt-3 grid md:grid-cols-5 gap-3 text-sm">
              {Object.entries(benchmark.evaluationSummary.metrics || {}).map(([metricName, metricValue]) => (
                <div key={metricName} className="rounded-lg bg-white p-3 border border-cyan-100">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{metricName.replace(/_/g, ' ')}</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{formatMetric(metricValue)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(benchmark?.topEvaluatedCases || []).length > 0 && (
          <div className="mt-5">
            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Evaluated Cases and Top Predictions
            </div>
            <div className="mt-3 grid xl:grid-cols-3 gap-4">
              {benchmark.topEvaluatedCases.map((item) => (
                <div key={`${item.drug}-${item.disease}`} className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-900/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{item.drug}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Held-out disease: {item.disease}</div>
                    </div>
                    <div className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold">
                      Rank {item.rank}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(item.top_predictions || []).slice(0, 5).map((prediction, index) => (
                      <div key={`${item.drug}-${prediction.disease}`} className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">
                            {index + 1}. {prediction.disease}
                          </div>
                          <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                            {formatMetric(prediction.score)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {benchmark?.benchmarkNotes?.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-semibold text-amber-900 flex items-center gap-2">
              <Beaker className="w-4 h-4" />
              Benchmark Caveats
            </div>
            <ul className="mt-2 space-y-1 text-sm text-amber-900/85">
              {benchmark.benchmarkNotes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-600" />
          Recommendation Dossier
        </h3>
        <div className="mt-4 space-y-4">
          {recommendations.map((item) => {
            const tone = getLabelTone(item.validationLabel);
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900 dark:text-white">{item.title}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EvidenceModeBadge dataMode={item.dataMode} verificationStatus={item.verificationStatus} />
                    <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${toneClass[tone]}`}>
                      {item.validationLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Confidence</div>
                    <div className="mt-1 font-bold text-slate-900 dark:text-white">{item.confidence}%</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Evidence Strength</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{item.evidenceStrength}</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Output Type</div>
                    <div className="mt-1 font-medium text-slate-900 dark:text-white">{item.outputType}</div>
                  </div>
                </div>
                <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <div className="font-semibold text-cyan-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Evidence Path
                    </div>
                    <div className="mt-2 text-cyan-900/90">
                      {item.evidencePath?.join(' -> ')}
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <div className="font-semibold text-rose-900 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" />
                      Contraindication
                    </div>
                    <div className="mt-2 text-rose-900/90">{item.contraindication}</div>
                  </div>
                </div>
                <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="font-semibold text-amber-900">Uncertainty</div>
                    <div className="mt-2 text-amber-900/90">{item.uncertainty}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="font-semibold text-emerald-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Source-Grounded Support
                    </div>
                    <ul className="mt-2 space-y-1 text-emerald-900/90">
                      {(item.supportingSources || []).map((source) => (
                        <li key={source.id}>- {source.id}: {source.title}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Confidence, Uncertainty, and Contraindications
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-xs uppercase tracking-wide text-slate-500">Confidence</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{validation.confidence_score || 0}%</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{validation.overall_confidence || 'N/A'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-700">
              <div className="text-xs uppercase tracking-wide text-slate-500">Risk Severity</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{validation.risk_severity || 'N/A'}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{validation.evidence_quality || 'N/A'} evidence</div>
            </div>
          </div>
          <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-semibold text-amber-900">Uncertainty Summary</div>
              <ul className="mt-2 space-y-1 text-amber-900/90">
                {(validation.uncertainty_summary || []).map((line) => (
                  <li key={line}>- {line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="font-semibold text-rose-900">Contraindication Reasoning</div>
              <ul className="mt-2 space-y-1 text-rose-900/90">
                {(validation.contraindications || []).map((line) => (
                  <li key={line}>- {line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-emerald-600" />
            Retrospective Case Studies
          </h3>
          <div className="mt-4 space-y-4">
            {retrospective.map((study) => (
              <div key={study.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/40">
                <div className="font-semibold text-slate-900 dark:text-white">{study.title}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Surfaced before: {study.surfacedBefore}
                </div>
                <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{study.rationale}</div>
                <div className="mt-2 text-sm text-cyan-700 dark:text-cyan-300">{study.evidencePath?.join(' -> ')}</div>
                <div className="mt-2 text-xs text-slate-500">{study.takeaway}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BenchmarkProductPanel;
