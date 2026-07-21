import React, { useState } from 'react';
import { useModel } from '../../context/ModelContext';

const ModelSwitcher = () => {
  const { selectedModel, setSelectedModel, modelConfig } = useModel();
  const [isOpen, setIsOpen] = useState(false);

  const models = [
    {
      id: 'gemini',
      name: 'Gemini 1.5 Flash',
      icon: '✨',
      description: 'Google AI - Free',
      badge: 'Cloud'
    },
    {
      id: 'ollama',
      name: 'Llama 3',
      icon: '🔒',
      description: 'Local - HIPAA compliant',
      badge: 'Secure'
    }
  ];

  const handleModelSelect = (modelId) => {
    setSelectedModel(modelId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Current Model Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors duration-200 border border-gray-700"
      >
        <span className="text-xl">{modelConfig.icon}</span>
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-white">{modelConfig.displayName}</span>
          <span className="text-xs text-gray-400">{modelConfig.cost}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase">
                Select AI Model
              </div>
              
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-md transition-colors duration-150 ${
                    selectedModel === model.id
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <span className="text-2xl">{model.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {selectedModel === model.id && (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{model.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      model.badge === 'Secure'
                        ? 'bg-green-900 text-green-300'
                        : 'bg-blue-900 text-blue-300'
                    }`}
                  >
                    {model.badge}
                  </span>
                </button>
              ))}
            </div>
            
            <div className="border-t border-gray-700 px-4 py-3 text-xs text-gray-400">
              <p>💡 <strong>Tip:</strong> Secure (Llama 3) is HIPAA-compliant and free. Cloud (Gemini) requires API key in <code className="px-1 py-0.5 bg-gray-700 rounded">.env</code></p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSwitcher;
