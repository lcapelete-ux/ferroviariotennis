import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { signInWithGoogle, signInAdminLocal, registerWithPhoneAndPassword, loginWithPhoneAndPassword, logout } from '../firebase';
import { Trophy, Shield, ArrowRight, User as UserIcon, Phone, Lock, Eye, EyeOff, Check } from 'lucide-react';

import { useSettings } from '../context/SettingsContext';

const TennisBall = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="50" cy="50" r="50" fill="#ccff00" />
    <path 
      d="M10,50 Q10,10 50,10 M50,90 Q90,90 90,50" 
      fill="none" 
      stroke="white" 
      strokeWidth="4" 
      strokeLinecap="round"
    />
    <path 
      d="M10,50 Q10,90 50,90 M50,10 Q90,10 90,50" 
      fill="none" 
      stroke="white" 
      strokeWidth="4" 
      strokeLinecap="round"
      opacity="0.3"
    />
  </svg>
);

const TennisRacket = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Racket Frame */}
    <ellipse cx="50" cy="45" rx="35" ry="42" stroke="currentColor" strokeWidth="6" />
    {/* Strings Grid */}
    <g stroke="currentColor" strokeWidth="1" strokeOpacity="0.4">
      {[25, 35, 45, 55, 65, 75].map(x => <line key={`v-${x}`} x1={x} y1={45-Math.sqrt(1-Math.pow((x-50)/35, 2))*42} x2={x} y2={45+Math.sqrt(1-Math.pow((x-50)/35, 2))*42} />)}
      {[15, 25, 35, 45, 55, 65, 75].map(y => <line key={`h-${y}`} x1={50-Math.sqrt(1-Math.pow((y-45)/42, 2))*35} y1={y} x2={50+Math.sqrt(1-Math.pow((y-45)/42, 2))*35} y2={y} />)}
    </g>
    {/* Neck */}
    <path d="M30 80L42 105H58L70 80" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
    {/* Handle */}
    <rect x="44" y="105" width="12" height="35" rx="2" fill="currentColor" />
    {/* Grip */}
    <path d="M44 110H56M44 118H56M44 126H56" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
  </svg>
);

type LoginMode = 'login' | 'register' | 'admin';

export default function Login() {
  const { user, profile, loading } = useAuth();
  const { settings } = useSettings();
  const [mode, setMode] = useState<LoginMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  
  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [preventRedirect, setPreventRedirect] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50 font-sans">Carregando...</div>;
  if (user && profile && !registrationSuccess && !preventRedirect) return <Navigate to="/dashboard" replace />;

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      let formatted = numbers;
      if (numbers.length > 2) formatted = `(${numbers.substring(0, 2)}) ${numbers.substring(2)}`;
      if (numbers.length > 7) formatted = `(${numbers.substring(0, 2)}) ${numbers.substring(2, 7)}-${numbers.substring(7, 11)}`;
      return formatted;
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    // Validações básicas
    if (!phone || !password) {
      setError("Por favor, preencha o celular e a senha.");
      return;
    }

    if (mode === 'register') {
      if (!fullName) {
        setError("Por favor, informe seu nome completo.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        setPreventRedirect(true);
        await registerWithPhoneAndPassword(fullName, phone, password);
        setRegistrationSuccess(true);
        await logout(); // Deslogar para que o usuário possa fazer o login manualmente como solicitado
      } else {
        await loginWithPhoneAndPassword(phone, password);
      }
    } catch (err: any) {
      setPreventRedirect(false);
      console.error("Auth error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Este celular já está cadastrado. Clique em 'Já tem conta? Faça login' abaixo para entrar.");
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials') {
        setError("Celular ou senha incorretos. Verifique os dados e tente novamente.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Erro de conexão. Verifique sua internet.");
      } else {
        setError("Erro na autenticação: " + (err.message || "Tente novamente mais tarde."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (adminUser === 'admin' && adminPass === 'admin') {
      try {
        await signInAdminLocal();
      } catch (err: any) {
        setError("Erro ao fazer login: " + err.message);
      }
    } else {
      setError("Credenciais incorretas.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') return;
      if (err.code === 'auth/cancelled-by-user') return;
      
      if (err.code === 'auth/unauthorized-domain') {
        setError("ERRO DE CONFIGURAÇÃO: Este link não está autorizado no Firebase. Adicione " + window.location.hostname + " nos domínios autorizados.");
      } else if (err.code === 'auth/popup-blocked') {
        setError("O seu navegador bloqueou a janela de login. Por favor, permita pop-ups.");
      } else {
        setError("Erro ao entrar com Google: " + err.message);
      }
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-64 bg-emerald-600 rounded-b-[100px] opacity-10 pointer-events-none"></div>
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          <div className="bg-white py-12 px-8 shadow-xl rounded-2xl border border-zinc-100 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <Check className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-3xl font-black text-zinc-900 mb-2">Cadastrado com sucesso!</h2>
            <p className="text-zinc-500 mb-8 font-medium">Sua conta foi criada com sucesso. Agora você já pode entrar no sistema com seu celular e senha.</p>
            <button
              onClick={() => {
                setRegistrationSuccess(false);
                setPreventRedirect(false);
                setMode('login');
                setPassword('');
                setConfirmPassword('');
              }}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95"
            >
              Fazer Login
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Entrance Animation Overlay */}
      <motion.div 
        initial={{ y: 0 }}
        animate={{ y: "-100%" }}
        transition={{ duration: 0.8, ease: "circOut" }}
        className="fixed inset-0 bg-[#004b23] z-[100] pointer-events-none"
      />

      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-64 bg-emerald-600 rounded-b-[100px] opacity-10 pointer-events-none"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="flex justify-center items-center py-6">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Racket Background */}
            <motion.div
              initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
              animate={{ opacity: 1, rotate: -15, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.8, type: "spring" }}
              className="absolute text-emerald-600/20 w-40 h-40"
            >
              <TennisRacket className="w-full h-full" />
            </motion.div>

            {/* Club Logo in Center */}
            <div className="relative z-20 w-32 h-32 flex items-center justify-center">
              {settings?.logoUrl ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.6 }}
                  className="w-full h-full p-4 flex items-center justify-center"
                >
                  <img 
                    src={settings.logoUrl} 
                    alt="Logo" 
                    className="max-w-full max-h-full object-contain drop-shadow-2xl" 
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.6 }}
                  className="w-20 h-20 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-200/50"
                >
                  <Trophy className="w-10 h-10 text-white" />
                </motion.div>
              )}
            </div>

            {/* Bouncing Ball hitting the "racket" / area */}
            <motion.div
              animate={{ 
                y: [0, -60, 0],
                x: [-10, 10, -10],
                rotate: [0, 180, 360],
                scaleY: [0.85, 1.05, 0.85],
                scaleX: [1.1, 0.95, 1.1],
              }}
              transition={{ 
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute -top-4 right-4 z-30 w-10 h-10"
            >
              <TennisBall className="w-full h-full drop-shadow-lg" />
            </motion.div>

            {/* Shadow for ball */}
            <motion.div
              animate={{ 
                scale: [1, 0.4, 1],
                opacity: [0.3, 0.1, 0.3],
              }}
              transition={{ 
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute top-12 right-6 w-8 h-2 bg-black/10 rounded-full blur-sm z-10"
            />
          </div>
        </div>
        <motion.h2 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 text-center text-4xl font-extrabold text-zinc-900 tracking-tight"
        >
          {settings?.clubName || 'Tennis FFC'}
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-2 text-center text-sm text-zinc-500 font-medium uppercase tracking-widest"
        >
          Clube de Tênis
        </motion.p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4"
      >
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-zinc-100">
          
          {mode !== 'admin' ? (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-zinc-800">
                  {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {mode === 'login' ? 'Entre para agendar sua quadra' : 'Cadastre-se para começar a jogar'}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded-r-xl">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Shield className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <form onSubmit={handleCustomSubmit} className="space-y-4">
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-5 w-5 text-zinc-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-zinc-300 rounded-xl shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-zinc-50/50"
                        placeholder="Seu nome completo"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Celular (WhatsApp)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-zinc-400" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={handlePhoneChange}
                      className="block w-full pl-10 pr-3 py-3 border border-zinc-300 rounded-xl shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-zinc-50/50"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Senha</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-zinc-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-3 border border-zinc-300 rounded-xl shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-zinc-50/50"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Repetir Senha</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-zinc-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full pl-10 pr-10 py-3 border border-zinc-300 rounded-xl shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-zinc-50/50"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Processando...' : (mode === 'login' ? 'Entrar' : 'Cadastrar')}
                  {!isSubmitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login'}
                </button>
              </div>

              <div className="mt-6 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-zinc-500">Ou continue com</span>
                </div>
              </div>
              
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-zinc-300 rounded-xl shadow-sm text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Google
              </button>

              <button
                onClick={() => setMode('admin')}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-sm font-medium text-zinc-400 hover:text-emerald-600 transition-all"
              >
                <Shield className="w-4 h-4" />
                Acesso Administrativo
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-zinc-800 flex items-center justify-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  Painel Admin
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Acesso administrativo restrito</p>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded-r-xl">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Shield className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Usuário</label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-zinc-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Senha</label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-zinc-300 rounded-xl shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all"
                >
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <button
                onClick={() => setMode('login')}
                className="w-full text-center text-sm text-zinc-500 hover:text-zinc-700 mt-4"
              >
                Voltar para login de sócios
              </button>
            </div>
          )}
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            Problemas com o login? <br />
            Para remover o link técnico e colocar o nome "Tennis FFC", acesse o <strong>Console do Firebase</strong> {">"} Autenticação {">"} Configurações {">"} Informações voltadas ao usuário.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
