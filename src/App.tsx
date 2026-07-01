import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import { AlertCircle } from 'lucide-react';
import PreLoader from './components/PreLoader';
import ErrorBoundary from './components/ErrorBoundary';
import { AnimatePresence, motion } from 'motion/react';
import { SettingsProvider, useSettings } from './context/SettingsContext';

const MiniLoader = () => (
  <div
    className="fixed inset-0 z-[9998] flex items-center justify-center"
    style={{ background: 'linear-gradient(160deg, #011a0d 0%, #022b15 50%, #011a0d 100%)' }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#c8f020] animate-spin" />
      <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.5em]">Carregando</p>
    </motion.div>
  </div>
);

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <MiniLoader />;
  if (!user || !profile) return <Navigate to="/" replace />;
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

const AuthenticatedRedirect = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <MiniLoader />;
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

const FooterAware = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const hideFooter = ['/dashboard', '/admin', '/profile'].some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow">{children}</main>
      {!hideFooter && (
        <footer className="bg-white border-t py-6">
          <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
            <p>© {new Date().getFullYear()} Tennis FFC — Clube de Tênis Ferroviário</p>
            <p>
              Desenvolvido por{' '}
              <a
                href="https://wa.me/5515991334809"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Marcelo Capelete
              </a>
            </p>
          </div>
        </footer>
      )}
    </div>
  );
};

const AppContent = () => {
  const [minTimerDone, setMinTimerDone] = useState(false);

  useEffect(() => {
    // PreLoader shows for exactly this duration, then the app renders.
    // Firebase settings load in the background — we don't block on them.
    const timer = setTimeout(() => setMinTimerDone(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const appLoading = !minTimerDone;

  // The PreLoader keeps its smooth fade-out (via AnimatePresence), but the app
  // content is a plain div so its visibility never depends on an animation
  // running — a stuck opacity animation must not leave a blank screen.
  return (
    <>
      <AnimatePresence>
        {appLoading && <PreLoader key="loader" />}
      </AnimatePresence>
      {!appLoading && (
        <div>
          <GlobalError />
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <FooterAware>
              <Routes>
                <Route path="/" element={<AuthenticatedRedirect><Landing /></AuthenticatedRedirect>} />
                <Route path="/welcome" element={<AuthenticatedRedirect><Welcome /></AuthenticatedRedirect>} />
                <Route path="/login" element={<AuthenticatedRedirect><Login /></AuthenticatedRedirect>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </FooterAware>
          </Router>
        </div>
      )}
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
