export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['@babel/preset-env', ['@babel/preset-react', { runtime: 'automatic' }]] }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@testing-library)/)',
  ],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(js|jsx)',
    '<rootDir>/src/**/*.(test|spec).(js|jsx)',
  ],
  collectCoverageFrom: [
    'src/**/*.(js|jsx)',
    '!src/main.jsx',
    '!src/index.css',
  ],
  globals: {
    'import.meta': {
      env: {
        VITE_API_URL: 'http://localhost:3001',
      },
    },
  },
};
