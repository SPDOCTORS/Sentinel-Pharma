/**
 * SentinelPharma Report Preview Page
 * ===============================
 * Detailed view of research analysis results.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { researchService } from '../services/api';

const ReportPreview = () => {
  const { requestId } = useParams();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadReport = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await researchService.getStatus(requestId);
        if (isMounted) {
          setReport(response.data);
        }
      } catch (err) {
        if (isMounted) {
          const cacheKey = `sentinel_report_${requestId}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              setReport(parsed);
              setError('Loaded from local cache because live status was unavailable.');
            } catch (_parseErr) {
              setError(err.response?.data?.message || 'Unable to load report preview for this request');
            }
          } else {
            setError(err.response?.data?.message || 'Unable to load report preview for this request');
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (requestId) {
      loadReport();
    }

    return () => {
      isMounted = false;
    };
  }, [requestId]);

  const agentEntries = useMemo(() => {
    const raw = report?.results || {};
    return Object.entries(raw).filter(([key, value]) => key !== 'processingTimeMs' && value);
  }, [report]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SentinelPharma Report', url });
      } catch (_err) {
        // User canceled share dialog.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      window.alert('Report link copied to clipboard');
    } catch (_err) {
      window.alert('Unable to copy link automatically. Please copy the URL from your browser.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Navigation */}
      <Link 
        to="/"
        className="inline-flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>
      
      {/* Report Header */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Research Report
          </h1>
          <div className="flex space-x-3">
            <button
              onClick={handleShare}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              type="button"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              type="button"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="text-sm text-gray-500">
          Request ID: {requestId}
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-600">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          Loading report preview...
        </div>
      )}

      {!isLoading && error && !report && (
        <div className="bg-red-50 border border-red-200 rounded-2xl shadow-lg p-8 text-red-700 flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load report</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {!isLoading && error && report && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-lg p-4 text-amber-800 flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!isLoading && !error && report && (
        <>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Status</p>
                <p className="mt-1 text-lg font-semibold text-emerald-900 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {report.status || 'completed'}
                </p>
              </div>
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <p className="text-xs uppercase tracking-wide text-cyan-700">Molecule</p>
                <p className="mt-1 text-lg font-semibold text-cyan-900">{report.molecule || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs uppercase tracking-wide text-violet-700">Processing Time</p>
                <p className="mt-1 text-lg font-semibold text-violet-900">
                  {report.results?.processingTimeMs ? `${report.results.processingTimeMs} ms` : 'N/A'}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-700">Quality</p>
                <p className="mt-1 text-lg font-semibold text-amber-900">
                  {report.metadata?.quality?.score ? `${report.metadata.quality.score}/10` : 'N/A'}
                </p>
                <p className="text-xs text-amber-700 mt-1">{report.metadata?.quality?.grade || 'Pending'}</p>
                {report.metadata?.quality?.score && (
                  <p className="text-[11px] text-amber-800 mt-1.5">
                    {report.metadata?.quality?.confidenceLevel || 'N/A'} confidence • {report.metadata?.quality?.riskSeverity || 'N/A'} risk • {report.metadata?.quality?.completedAgents ?? 0}/{report.metadata?.quality?.expectedAgents ?? 0} agents
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Outputs</h2>
            {agentEntries.length === 0 ? (
              <p className="text-gray-500">No agent data is available for this request.</p>
            ) : (
              <div className="space-y-4">
                {agentEntries.map(([agentKey, payload]) => (
                  <div key={agentKey} className="rounded-xl border border-gray-200 p-4">
                    <p className="font-semibold text-gray-900 capitalize mb-2">
                      {agentKey.replaceAll('_', ' ')}
                    </p>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ReportPreview;
