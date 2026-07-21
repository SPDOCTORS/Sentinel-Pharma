// Mock for api.js
export const authService = {
  login: jest.fn(),
  googleLogin: jest.fn(),
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  me: jest.fn(),
  logout: jest.fn(),
  getCurrentUser: jest.fn(),
};

export const researchService = {
  submitResearch: jest.fn(),
  getResearchStatus: jest.fn(),
  getResearchResults: jest.fn(),
};
