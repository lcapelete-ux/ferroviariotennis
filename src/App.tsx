import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import { AlertCircle } from 'lucide-react';
import PreLoader from './components/PreLoader';
import { AnimatePresence, motion } from 'motion/react';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-16 h-16 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && profile.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AuthenticatedRedirect = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-16 h-16 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (user && profile) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const GlobalError = () => {
  const { error } = useAuth();
  if (!error) return null;

  return (
    <div className="px-4 py-6 sticky top-0 z-[9999] shadow-lg bg-amber-50 border-b border-amber-200">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl shrink-0 shadow-sm bg-amber-100">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-black uppercase tracking-tight mb-2 text-amber-900">
              Aviso do Sistema
            </h3>
            <div className="text-sm font-medium whitespace-pre-wrap leading-relaxed mb-6 text-amber-800">
              {error}
            </div>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all active:scale-95 shadow-md flex items-center gap-2 bg-amber-600 hover:bg-amber-700"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import { SettingsProvider, useSettings } from './context/SettingsContext';

const AppContent = () => {
  const [minTimerDone, setMinTimerDone] = useState(false);
  const { loading: settingsLoading } = useSettings();

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 2800); // 2.8 seconds pre-loader for impact
    return () => clearTimeout(timer);
  }, []);

  const appLoading = settingsLoading || !minTimerDone;

  return (
    <AnimatePresence mode="wait">
      {appLoading ? (
        <PreLoader key="loader" />
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
        >
          <GlobalError />
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <div className="min-h-screen flex flex-col">
              <main className="flex-grow">
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<AuthenticatedRedirect><Landing /></AuthenticatedRedirect>} />
                  <Route path="/welcome" element={<AuthenticatedRedirect><Welcome /></AuthenticatedRedirect>} />
                  <Route path="/login" element={<AuthenticatedRedirect><Login /></AuthenticatedRedirect>} />
                  
                  {/* Private Routes */}
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
                  
                  {/* Default Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
              <footer className="bg-white border-t py-8 text-center">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-400 text-xs font-medium uppercase tracking-widest">
                  <p>© {new Date().getFullYear()} TENNIS HUB - CLUBE DE TÊNIS FERROVIÁRIO</p>
                  <p>DESENVOLVIDO POR <a href="https://wa.me/5515991334809" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 font-bold transition-colors">MARCELO CAPELETE</a></p>
                </div>
              </footer>
            </div>
          </Router>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SettingsProvider>
  );
}
