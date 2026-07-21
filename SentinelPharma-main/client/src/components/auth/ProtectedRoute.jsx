import React from 'react';
import { Navigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AuthLoadingScreen = () => (
  <div className="min-h-screen auth-shell flex items-center justify-center p-6">
    <div className="w-full max-w-md auth-card rounded-3xl p-8 text-center">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
        <Shield className="w-8 h-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">Authorizing Session</h1>
      <p className="mt-2 text-slate-600">Verifying your secure SentinelPharma workspace access.</p>
      <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Please wait...</span>
      </div>
    </div>
  </div>
);

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

