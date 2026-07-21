import React, { createContext, useContext, useState, useEffect } from 'react';

const ModelContext = createContext();

export const useModel = () => {
  const context = useContext(ModelContext);
  if (!context) {
    const noop = () => {};
    return {
      selectedModel: 'gemini',
      setSelectedModel: noop,
      modelConfig: {
        provider: 'gemini',
        displayName: 'Gemini 1.5 Flash',
        description: 'Google AI - Free, fast, capable',
        icon: '✨',
        cost: 'Free (1M tokens/month)'
      },
      availableModels: ['gemini', 'ollama']
    };
  }
  return context;
};

export const ModelProvider = ({ children }) => {
  const [selectedModel, setSelectedModel] = useState(() => {
    // Load from localStorage or default to gemini
    try {
      return localStorage.getItem('sentinelpharma_model') || 'gemini';
    } catch {
      return 'gemini';
    }
  });

  useEffect(() => {
    // Save to localStorage whenever model changes
    try {
      localStorage.setItem('sentinelpharma_model', selectedModel);
    } catch {
      // Ignore storage write failures (private mode, policy restrictions, etc.)
    }
  }, [selectedModel]);

  const getModelConfig = () => {
    const configs = {
      gemini: {
        provider: 'gemini',
        displayName: 'Gemini 1.5 Flash',
        description: 'Google AI - Free, fast, capable',
        icon: '✨',
        cost: 'Free (1M tokens/month)'
      },
      ollama: {
        provider: 'ollama',
        displayName: 'Llama 3 (Secure)',
        description: 'HIPAA-compliant, runs locally',
        icon: '🔒',
        cost: 'Free (Local)'
      }
    };

    return configs[selectedModel] || configs.gemini;
  };

  const value = {
    selectedModel,
    setSelectedModel,
    modelConfig: getModelConfig(),
    availableModels: ['gemini', 'ollama']
  };

  return (
    <ModelContext.Provider value={value}>
      {children}
    </ModelContext.Provider>
  );
};
