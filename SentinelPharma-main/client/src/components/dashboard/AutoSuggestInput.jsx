/**
 * SentinelPharma Auto-Suggest Input Component
 * =========================================
 * Context-aware query interface with molecule auto-suggestions.
 * 
 * Features:
 * - Auto-complete suggestions based on partial input
 * - Drug/molecule database suggestions
 * - Natural language query support
 * - Keyboard navigation
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, Pill, Dna, FlaskConical } from 'lucide-react';
import { debounce } from '../../utils/debounce';

// Mock molecule database - in production, this would come from an API
const MOLECULE_DATABASE = [
  { name: 'Aspirin', type: 'drug', category: 'NSAID', synonyms: ['Acetylsalicylic acid', 'ASA'] },
  { name: 'Metformin', type: 'drug', category: 'Antidiabetic', synonyms: ['Glucophage'] },
  { name: 'Imatinib', type: 'drug', category: 'Tyrosine kinase inhibitor', synonyms: ['Gleevec'] },
  { name: 'Rapamycin', type: 'drug', category: 'Immunosuppressant', synonyms: ['Sirolimus'] },
  { name: 'Thalidomide', type: 'drug', category: 'Immunomodulator', synonyms: [] },
  { name: 'Sildenafil', type: 'drug', category: 'PDE5 inhibitor', synonyms: ['Viagra'] },
  { name: 'Minoxidil', type: 'drug', category: 'Vasodilator', synonyms: ['Rogaine'] },
  { name: 'Gabapentin', type: 'drug', category: 'Anticonvulsant', synonyms: ['Neurontin'] },
  { name: 'Rituximab', type: 'biologic', category: 'Monoclonal antibody', synonyms: ['Rituxan'] },
  { name: 'Adalimumab', type: 'biologic', category: 'TNF inhibitor', synonyms: ['Humira'] },
  { name: 'Pembrolizumab', type: 'biologic', category: 'PD-1 inhibitor', synonyms: ['Keytruda'] },
  { name: 'Nivolumab', type: 'biologic', category: 'PD-1 inhibitor', synonyms: ['Opdivo'] },
  { name: 'Trastuzumab', type: 'biologic', category: 'HER2 inhibitor', synonyms: ['Herceptin'] },
  { name: 'Bevacizumab', type: 'biologic', category: 'VEGF inhibitor', synonyms: ['Avastin'] },
  { name: 'Ozempic', type: 'drug', category: 'GLP-1 agonist', synonyms: ['Semaglutide'] },
  { name: 'Atorvastatin', type: 'drug', category: 'Statin', synonyms: ['Lipitor'] },
  { name: 'Lisinopril', type: 'drug', category: 'ACE inhibitor', synonyms: ['Prinivil', 'Zestril'] },
  { name: 'Amlodipine', type: 'drug', category: 'Calcium channel blocker', synonyms: ['Norvasc'] },
  { name: 'Omeprazole', type: 'drug', category: 'Proton pump inhibitor', synonyms: ['Prilosec'] },
  { name: 'Sertraline', type: 'drug', category: 'SSRI', synonyms: ['Zoloft'] },
  { name: 'Fluoxetine', type: 'drug', category: 'SSRI', synonyms: ['Prozac'] },
  { name: 'Duloxetine', type: 'drug', category: 'SNRI', synonyms: ['Cymbalta'] },
  { name: 'Pregabalin', type: 'drug', category: 'Anticonvulsant', synonyms: ['Lyrica'] },
  { name: 'Celecoxib', type: 'drug', category: 'COX-2 inhibitor', synonyms: ['Celebrex'] },
];

// Natural language query examples
const QUERY_SUGGESTIONS = [
  'Find repurposing opportunities for {drug} in Oncology',
  'Analyze {drug} for neurodegenerative diseases',
  'Evaluate {drug} market potential in rare diseases',
  'Check patent landscape for {drug} derivatives',
  'Identify new indications for {drug}',
];

const AutoSuggestInput = ({ 
  value, 
  onChange, 
  onSubmit, 
  placeholder = "Enter drug name or search query...",
  disabled = false 
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  
  const inputRef = useRef(null);
  const suggestionRef = useRef(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sentinelpharma_recent_searches');
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // Ignore storage read failures (private mode / policy restrictions).
      setRecentSearches([]);
    }
  }, []);

  // Search function with debounce
  const searchMolecules = useMemo(
    () => debounce((query) => {
      if (query.length < 2) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      
      // Simulate API delay
      setTimeout(() => {
        const lowerQuery = query.toLowerCase();
        
        // Search in molecule database
        const moleculeMatches = MOLECULE_DATABASE.filter(mol => 
          mol.name.toLowerCase().includes(lowerQuery) ||
          mol.category.toLowerCase().includes(lowerQuery) ||
          mol.synonyms.some(syn => syn.toLowerCase().includes(lowerQuery))
        ).map(mol => ({
          ...mol,
          matchType: 'molecule'
        }));

        // Generate natural language suggestions
        const nlpSuggestions = QUERY_SUGGESTIONS.map(template => ({
          name: template.replace('{drug}', query),
          type: 'query',
          matchType: 'nlp'
        })).slice(0, 2);

        setSuggestions([...moleculeMatches.slice(0, 6), ...nlpSuggestions]);
        setIsLoading(false);
      }, 150);
    }, 300),
    []
  );

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
    
    if (newValue.trim()) {
      searchMolecules(newValue);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion) => {
    const newValue = suggestion.matchType === 'nlp' ? suggestion.name : suggestion.name;
    onChange(newValue);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    
    // Save to recent searches
    const updated = [newValue, ...recentSearches.filter(s => s !== newValue)].slice(0, 5);
    setRecentSearches(updated);
    try {
      localStorage.setItem('sentinelpharma_recent_searches', JSON.stringify(updated));
    } catch {
      // Ignore storage write failures.
    }
    
    // Auto-submit for molecule selections
    if (suggestion.matchType === 'molecule') {
      onSubmit && onSubmit(newValue);
    }
  };

  // Submit handler
  const handleSubmit = () => {
    if (value.trim()) {
      // Save to recent searches
      const updated = [value, ...recentSearches.filter(s => s !== value)].slice(0, 5);
      setRecentSearches(updated);
      try {
        localStorage.setItem('sentinelpharma_recent_searches', JSON.stringify(updated));
      } catch {
        // Ignore storage write failures.
      }
      
      setShowSuggestions(false);
      onSubmit && onSubmit(value);
    }
  };

  // Get icon for suggestion type
  const getTypeIcon = (type) => {
    switch (type) {
      case 'drug': return <Pill className="w-4 h-4 text-blue-500" />;
      case 'biologic': return <Dna className="w-4 h-4 text-purple-500" />;
      case 'query': return <Search className="w-4 h-4 text-green-500" />;
      default: return <FlaskConical className="w-4 h-4 text-gray-500" />;
    }
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!inputRef.current) {
        return;
      }
      if (
        suggestionRef.current && 
        !suggestionRef.current.contains(event.target) &&
        !inputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex-1">
      {/* Input Field */}
      <div className="relative">
        <Search className="absolute left-4 top-[calc(50%+0.2rem)] -translate-y-1/2 w-5 h-5 text-[var(--research-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim() && suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="research-input pl-12 pr-10"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-[calc(50%+0.2rem)] -translate-y-1/2 w-5 h-5 text-[var(--research-muted)] animate-spin" />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (suggestions.length > 0 || recentSearches.length > 0) && (
        <div 
          ref={suggestionRef}
          className="absolute z-50 w-full mt-2 bg-[var(--research-surface)] rounded-lg border border-[var(--research-border)] max-h-80 overflow-y-auto text-[var(--research-ink)]"
        >
          {/* Recent Searches */}
          {!value.trim() && recentSearches.length > 0 && (
            <div className="p-2 border-b border-[var(--research-border)]">
              <div className="px-3 py-1 text-xs font-medium text-[var(--research-muted)] uppercase">
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={`recent-${index}`}
                  onClick={() => selectSuggestion({ name: search, matchType: 'recent' })}
                  className="w-full flex items-center px-3 py-2 hover:bg-[var(--research-surface-muted)] rounded-lg text-left"
                >
                  <Search className="w-4 h-4 text-[var(--research-muted)] mr-3" />
                  <span>{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Molecule Suggestions */}
          {suggestions.filter(s => s.matchType === 'molecule').length > 0 && (
            <div className="p-2 border-b border-[var(--research-border)]">
              <div className="px-3 py-1 text-xs font-medium text-[var(--research-muted)] uppercase">
                Molecules
              </div>
              {suggestions.filter(s => s.matchType === 'molecule').map((suggestion, index) => (
                <button
                  key={`mol-${index}`}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedIndex === index ? 'bg-[var(--research-surface-muted)]' : 'hover:bg-[var(--research-surface-muted)]'
                  }`}
                >
                  {getTypeIcon(suggestion.type)}
                  <div className="ml-3 flex-1">
                    <div className="font-medium">{suggestion.name}</div>
                    <div className="text-xs text-[var(--research-muted)]">
                      {suggestion.category}
                      {suggestion.synonyms?.length > 0 && (
                        <span className="ml-2">
                          ({suggestion.synonyms.slice(0, 2).join(', ')})
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    suggestion.type === 'drug' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                  }`}>
                    {suggestion.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* NLP Query Suggestions */}
          {suggestions.filter(s => s.matchType === 'nlp').length > 0 && (
            <div className="p-2">
              <div className="px-3 py-1 text-xs font-medium text-[var(--research-muted)] uppercase">
                Suggested Queries
              </div>
              {suggestions.filter(s => s.matchType === 'nlp').map((suggestion, index) => {
                const actualIndex = suggestions.filter(s => s.matchType === 'molecule').length + index;
                return (
                  <button
                    key={`nlp-${index}`}
                    onClick={() => selectSuggestion(suggestion)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors ${
                      selectedIndex === actualIndex ? 'bg-[var(--research-surface-muted)]' : 'hover:bg-[var(--research-surface-muted)]'
                    }`}
                  >
                    {getTypeIcon('query')}
                    <span className="ml-3">{suggestion.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoSuggestInput;
