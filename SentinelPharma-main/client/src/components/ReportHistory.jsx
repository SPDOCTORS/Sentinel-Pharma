/**
 * Report History Component
 * =========================
 * Displays saved research reports with options to view, download, and delete.
 * Integrates with the Archival System API.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const VITE_ENV = typeof import.meta !== 'undefined' ? (import.meta.env || {}) : {};

const API_BASE = VITE_ENV.VITE_API_URL ||
              ((typeof process !== 'undefined' && process.env?.VITE_API_URL) ? process.env.VITE_API_URL : undefined) ||
              (typeof window !== 'undefined' && window.VITE_API_URL) ||
              'http://localhost:3001';

/**
 * Report History Panel
 * Shows list of saved reports with search, filter, and actions
 */
const ReportHistory = ({ onViewReport, onClose }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('completed');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [stats, setStats] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const ITEMS_PER_PAGE = 10;

  // Fetch reports
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        sortBy,
        sortOrder,
        ...(statusFilter && { status: statusFilter }),
        ...(searchTerm && { molecule: searchTerm })
      });

      const response = await axios.get(`${API_BASE}/api/archive/reports?${params}`);
      
      if (response.data.success) {
        setReports(response.data.data.reports);
        setPagination(response.data.data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setError('Failed to load reports. Please try again.');
      // Use mock data for demo
      setReports(getMockReports());
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, sortBy, sortOrder, searchTerm]);

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/archive/reports/stats`);
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      // Use mock stats
      setStats({
        totalReports: 12,
        completedReports: 10,
        archivedReports: 2,
        recentReports: 5,
        topMolecules: [
          { molecule: 'Metformin', count: 3 },
          { molecule: 'Semaglutide', count: 2 },
          { molecule: 'Pembrolizumab', count: 2 }
        ]
      });
    }
  };

  useEffect(() => {
    fetchReports();
    fetchStats();
  }, [fetchReports]);

  // Delete report
  const handleDelete = async (reportId) => {
    try {
      await axios.delete(`${API_BASE}/api/archive/reports/${reportId}`);
      setShowDeleteConfirm(null);
      fetchReports();
      fetchStats();
    } catch (err) {
      console.error('Failed to delete report:', err);
      setError('Failed to delete report');
    }
  };

  // Archive report
  const handleArchive = async (reportId) => {
    try {
      await axios.put(`${API_BASE}/api/archive/reports/${reportId}/archive`);
      fetchReports();
      fetchStats();
    } catch (err) {
      console.error('Failed to archive report:', err);
    }
  };

  // Download PDF
  const handleDownloadPDF = async (report) => {
    try {
      const response = await axios.get(
        `${API_BASE}/api/archive/reports/${report._id}/pdf`,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SentinelPharma_${report.molecule}_${report.requestId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setError('Failed to download PDF');
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Status badge colors
  const statusColors = {
    completed: 'bg-green-100 text-green-800',
    processing: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    archived: 'bg-gray-100 text-gray-800'
  };

  // Mode badge colors
  const modeColors = {
    cloud: 'bg-blue-100 text-blue-800',
    secure: 'bg-purple-100 text-purple-800'
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📚</span>
            <div>
              <h2 className="text-xl font-bold text-white">Report History</h2>
              <p className="text-indigo-200 text-sm">
                {stats?.totalReports || 0} saved reports
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center space-x-6 overflow-x-auto">
            <div className="flex items-center space-x-2">
              <span className="text-green-600">✓</span>
              <span className="text-sm text-gray-600">{stats.completedReports} Completed</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">📁</span>
              <span className="text-sm text-gray-600">{stats.archivedReports} Archived</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-blue-500">📈</span>
              <span className="text-sm text-gray-600">{stats.recentReports} This Week</span>
            </div>
            <div className="border-l border-gray-300 h-4"></div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Top Molecules:</span>
              {stats.topMolecules?.slice(0, 3).map((m, i) => (
                <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                  {m.molecule} ({m.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by molecule..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="archived">Archived</option>
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="molecule-asc">Molecule A-Z</option>
            <option value="molecule-desc">Molecule Z-A</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchReports}
            className="px-4 py-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Report List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600">
              <p>{error}</p>
              <button
                onClick={fetchReports}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Retry
              </button>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-6xl">📭</span>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No reports found</h3>
              <p className="mt-2 text-gray-500">
                {searchTerm ? 'Try a different search term' : 'Start a new research to generate reports'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agents
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reports.map((report) => (
                  <tr key={report._id || report.requestId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{report.molecule}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {report.query || report.summary?.overallAssessment?.slice(0, 50) || 'No summary'}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          {report.requestId?.slice(0, 8)}...
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[report.status]}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${modeColors[report.processingMode]}`}>
                        {report.processingMode === 'secure' ? '🔒 Secure' : '☁️ Cloud'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(report.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {report.agentsExecuted?.slice(0, 3).map((agent, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {agent.name || agent}
                          </span>
                        ))}
                        {(report.agentsExecuted?.length || 0) > 3 && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            +{report.agentsExecuted.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onViewReport && onViewReport(report)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="View Report"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(report)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                          title="Download PDF"
                        >
                          📥
                        </button>
                        <button
                          onClick={() => handleArchive(report._id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                          title="Archive"
                        >
                          📁
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(report._id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, pagination.total)} of{' '}
              {pagination.total} reports
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              {[...Array(pagination.pages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`px-3 py-1 rounded-lg ${
                    currentPage === i + 1
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(pagination.pages, p + 1))}
                disabled={currentPage === pagination.pages}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
              <h3 className="text-lg font-medium text-gray-900">Delete Report?</h3>
              <p className="mt-2 text-gray-500">
                This will archive the report. You can restore it later from the archived section.
              </p>
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Mock reports for demo/fallback
 */
const getMockReports = () => [
  {
    _id: '1',
    requestId: 'abc12345-6789-0def-ghij-klmnopqrstuv',
    molecule: 'Metformin',
    query: 'Analyze metformin repurposing potential for colorectal cancer',
    processingMode: 'cloud',
    status: 'completed',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    agentsExecuted: [
      { name: 'clinical', status: 'completed' },
      { name: 'patent', status: 'completed' },
      { name: 'market', status: 'completed' }
    ],
    summary: { overallAssessment: 'Strong repurposing potential with Phase 3 trials ongoing' }
  },
  {
    _id: '2',
    requestId: 'def67890-1234-5abc-ghij-klmnopqrstuv',
    molecule: 'Semaglutide',
    query: 'GLP-1 market analysis and competitive landscape',
    processingMode: 'secure',
    status: 'completed',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    agentsExecuted: [
      { name: 'market', status: 'completed' },
      { name: 'iqvia', status: 'completed' }
    ],
    summary: { overallAssessment: '$50B+ market opportunity with supply constraints' }
  },
  {
    _id: '3',
    requestId: 'ghi11111-2222-3333-4444-555566667777',
    molecule: 'Pembrolizumab',
    query: 'Patent cliff analysis and biosimilar entry timeline',
    processingMode: 'cloud',
    status: 'completed',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    agentsExecuted: [
      { name: 'patent', status: 'completed' },
      { name: 'market', status: 'completed' },
      { name: 'clinical', status: 'completed' },
      { name: 'iqvia', status: 'completed' }
    ],
    summary: { overallAssessment: 'Biosimilar entry expected 2028-2030 with complex IP landscape' }
  }
];

export default ReportHistory;
