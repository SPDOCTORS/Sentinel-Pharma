module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  settings: {
    react: {
      version: 'detect'
    }
  },
  plugins: ['react-refresh'],
  globals: {
    process: 'readonly'
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  },
  overrides: [
    {
      files: ['src/**/*.test.{js,jsx}', 'src/**/__tests__/**/*.{js,jsx}'],
      rules: {
        'react/display-name': 'off'
      }
    },
    {
      files: ['src/context/**/*.{js,jsx}'],
      rules: {
        'react-refresh/only-export-components': 'off'
      }
    }
  ],
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/']
};
