/**
 * Strategy Selector Component
 * ============================
 * Dropdown component for selecting pre-filled strategic queries
 * from the Synthetic Query Library.
 */

import React, { useState, useMemo } from 'react';
import { 
  SYNTHETIC_QUERIES, 
  QUERY_CATEGORIES, 
  getGroupedQueryOptions,
  getQueryById 
} from '../data/syntheticQueries';

/**
 * Strategy Selector Dropdown
 * @param {function} onSelectQuery - Callback when query is selected
 * @param {string} selectedId - Currently selected query ID
 * @param {boolean} disabled - Whether the selector is disabled
 */
const StrategySelector = ({ 
  onSelectQuery, 
  selectedId = null,
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  // Get grouped options
  const groupedOptions = useMemo(() => getGroupedQueryOptions(), []);

  // Filter queries based on search
  const filteredQueries = useMemo(() => {
    if (!searchTerm) return SYNTHETIC_QUERIES;
    
    const term = searchTerm.toLowerCase();
    return SYNTHETIC_QUERIES.filter(q => 
      q.title.toLowerCase().includes(term) ||
      q.molecule.toLowerCase().includes(term) ||
      q.query.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  // Handle query selection
  const handleSelect = (queryId) => {
    const query = getQueryById(queryId);
    if (query && onSelectQuery) {
      onSelectQuery(query);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  // Get selected query for display
  const selectedQuery = selectedId ? getQueryById(selectedId) : null;

  // Complexity badge colors
  const complexityColors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800'
  };

  return (
    <div className="relative w-full">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        📚 Strategic Query Library
      </label>
      
      {/* Main selector button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3 text-left bg-white border rounded-lg shadow-sm
          flex items-center justify-between
          ${disabled 
            ? 'bg-gray-100 cursor-not-allowed text-gray-500' 
            : 'hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'
          }
          ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-gray-300'}
        `}
      >
        <div className="flex items-center space-x-2 overflow-hidden">
          {selectedQuery ? (
            <>
              <span className="text-xl">{selectedQuery.icon || '🔬'}</span>
              <div className="truncate">
                <div className="font-medium text-gray-900">{selectedQuery.title}</div>
                <div className="text-xs text-gray-500">{selectedQuery.molecule}</div>
              </div>
            </>
          ) : (
            <span className="text-gray-500">
              Select a pre-filled strategic query...
            </span>
          )}
        </div>
        
        {/* Chevron */}
        <svg 
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search queries, molecules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Category tabs */}
          <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`
                px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap mr-1
                ${!activeCategory 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              All ({SYNTHETIC_QUERIES.length})
            </button>
            {Object.entries(QUERY_CATEGORIES).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`
                  px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap mr-1
                  ${activeCategory === key 
                    ? 'bg-indigo-100 text-indigo-700' 
                    : 'text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Query list */}
          <div className="overflow-y-auto max-h-64">
            {(activeCategory 
              ? filteredQueries.filter(q => q.category === activeCategory)
              : filteredQueries
            ).map((query) => (
              <button
                key={query.id}
                onClick={() => handleSelect(query.id)}
                className={`
                  w-full px-4 py-3 text-left hover:bg-indigo-50 border-b border-gray-100
                  ${selectedId === query.id ? 'bg-indigo-50' : ''}
                `}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-xl flex-shrink-0">{query.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 truncate">
                        {query.title}
                      </span>
                      <span className={`
                        ml-2 px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0
                        ${complexityColors[query.complexity]}
                      `}>
                        {query.complexity}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 space-x-2">
                      <span className="text-xs font-medium text-indigo-600">
                        {query.molecule}
                      </span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">
                        {QUERY_CATEGORIES[query.category]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                      {query.query.slice(0, 120)}...
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {query.expectedAgents.slice(0, 4).map((agent) => (
                        <span
                          key={agent}
                          className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                        >
                          {agent}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            
            {filteredQueries.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                No queries match your search
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-gray-50 border-t border-gray-200 text-center">
            <span className="text-xs text-gray-500">
              {SYNTHETIC_QUERIES.length} strategic queries available
            </span>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default StrategySelector;
