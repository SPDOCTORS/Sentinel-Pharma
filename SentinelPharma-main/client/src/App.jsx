import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ThemeProvider } from './context/ThemeContext';
import { ResearchProvider } from './context/ResearchContext';
import { ModelProvider } from './context/ModelContext';
import { AuthProvider } from './context/AuthContext';

import Navbar from './components/layout/Navbar';
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/ProtectedRoute';
import ResearchDashboard from './pages/ResearchDashboard';
import ReportPreview from './pages/ReportPreview';
import LoginPage from './pages/LoginPage';

function Layout({ children }) {
  return (
    <div className="research-app-shell min-h-screen">
      <Navbar />
      <main className="research-app-main">{children}</main>
      <footer className="research-app-footer">
        <span>SentinelPharma biomedical evidence workbench</span>
        <span>Research support only · Not clinical guidance</span>
      </footer>
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <Layout>
            <ResearchDashboard />
          </Layout>
        </ProtectedRoute>
      )
    },
    {
      path: '/report/:requestId',
      element: (
        <ProtectedRoute>
          <Layout>
            <ReportPreview />
          </Layout>
        </ProtectedRoute>
      )
    },
    {
      path: '/login',
      element: (
        <PublicOnlyRoute>
          <LoginPage />
        </PublicOnlyRoute>
      )
    }
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
);

function App() {
  return (
    <ThemeProvider defaultMode="dark">
      <AuthProvider>
        <ModelProvider>
          <ResearchProvider>
            <RouterProvider router={router} />
          </ResearchProvider>
        </ModelProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
