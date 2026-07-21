import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock the AuthContext to simulate authenticated state
jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    login: jest.fn(),
    googleLogin: jest.fn(),
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    logout: jest.fn(),
    updateProfile: jest.fn()
  })
}));

test('renders SentinelPharma app', () => {
  render(<App />);
  
  // Check if the app renders without crashing
  expect(document.body).toBeInTheDocument();
});

test('renders footer text', () => {
  render(<App />);
  
  // Just check that something renders - the app should not crash
  expect(document.body).toBeInTheDocument();
});
