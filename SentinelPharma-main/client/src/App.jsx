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
    <div className="min-h-screen text-slate-100 relative overflow-hidden">
      <div className="fixed inset-0 biotech-bg pointer-events-none" />
      <div className="fixed inset-0 biotech-grid pointer-events-none opacity-35" />

      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-4 py-8">{children}</main>

        <footer className="border-t border-cyan-500/20 py-6 mt-auto bg-slate-950/60 backdrop-blur-xl">
          <div className="container mx-auto px-4 text-center text-cyan-100/70 text-sm">
            SentinelPharma Neural Repurposing Workbench
          </div>
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
