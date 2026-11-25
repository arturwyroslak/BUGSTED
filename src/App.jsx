import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterInvitePage from './pages/RegisterInvitePage';
import ApplicationDashboardPage from './pages/ApplicationDashboardPage';
import AllBugsPage from './pages/AllBugsPage';
import ReportBugPage from './pages/ReportBugPage';
import BugDetailsPage from './pages/BugDetailsPage';
import AdminPanelPage from './pages/AdminPanelPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-sm text-neutral-300">
        {t('common.loadingApp')}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/logowanie" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
          <Route
            path="/logowanie"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/rejestracja/:token" element={<RegisterInvitePage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AllBugsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/bledy" element={<Navigate to="/" replace />} />
          <Route
            path="/aplikacje/:id"
            element={
              <ProtectedRoute>
                <ApplicationDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bledy/:id"
            element={
              <ProtectedRoute>
                <BugDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/zglos-blad"
            element={
              <ProtectedRoute>
                <ReportBugPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminPanelPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ustawienia"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}
