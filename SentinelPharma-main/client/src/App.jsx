import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ThemeProvider } from './context/ThemeContext';
import { ResearchProvider } from './context/ResearchContext';
import { ModelProvider } from './context/ModelContext';
import { AuthProvider } from './context/AuthContext';

import Sidebar from './components/layout/Sidebar';
import TopHeader from './components/layout/TopHeader';
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/ProtectedRoute';
import ResearchDashboard from './pages/ResearchDashboard';
import ReportPreview from './pages/ReportPreview';
import LoginPage from './pages/LoginPage';

/**
 * Workstation layout: fixed left sidebar + scrollable content column.
 * title is passed down to TopHeader for a per-route page heading.
 */
function Layout({ children, title }) {
  return (
    <div className="ws-shell">
      <Sidebar />
      <div className="ws-content-column">
        <TopHeader title={title} />
        <main className="ws-main" id="main-content">
          {children}
        </main>
        <footer className="ws-footer" role="contentinfo">
          <span>SentinelPharma · biomedical evidence workbench</span>
          <span>Research support only · Not clinical guidance</span>
        </footer>
      </div>
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <Layout title="Research Dashboard">
            <ResearchDashboard />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: '/report/:requestId',
      element: (
        <ProtectedRoute>
          <Layout title="Report Preview">
            <ReportPreview />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: '/login',
      element: (
        <PublicOnlyRoute>
          <LoginPage />
        </PublicOnlyRoute>
      ),
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

function App() {
  return (
    <ThemeProvider defaultMode="light">
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
