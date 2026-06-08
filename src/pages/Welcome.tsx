import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Trophy, ArrowRight } from 'lucide-react';

const TennisBall = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="10" fill="#ccff00" />
    <path d="M5.5 18.5C7.5 16.5 8.5 14.5 8.5 12C8.5 9.5 7.5 7.5 5.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M18.5 5.5C16.5 7.5 15.5 9.5 15.5 12C15.5 14.5 16.5 16.5 18.5 18.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center relative overflow-hidden font-sans p-4">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-[60vh] bg-emerald-600 rounded-b-[100px] shadow-2xl opacity-10 pointer-events-none"></div>
      
      {/* Main Content */}
      <div className="relative z-10 max-w-lg w-full text-center space-y-8">
        {/* Logo/Icon Area */}
        <motion.div 
          initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="flex justify-center items-center gap-6 mb-12"
        >
          <div className="w-24 h-24 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl transform -rotate-6 hover:rotate-0 transition-transform duration-500">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl transform rotate-12 hover:rotate-0 transition-transform duration-500 border-8 border-emerald-50">
            <TennisBall className="w-16 h-16" />
          </div>
        </motion.div>

        {/* Text Area */}
        <div className="space-y-4">
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-6xl font-black text-zinc-900 tracking-tight"
          >
            TENNIS <span className="text-emerald-600">FFC</span>
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm font-black uppercase tracking-[0.4em] text-emerald-700/60"
          >
            Clube de Tênis Ferroviário
          </motion.p>
        </div>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="pt-12"
        >
          <button
            onClick={() => navigate('/login')}
            className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase tracking-widest overflow-hidden transition-all hover:bg-emerald-700 active:scale-95 shadow-[0_20px_50px_rgba(5,_150,_105,_0.3)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <span className="relative">Começar Agora</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-zinc-400 text-xs font-semibold uppercase tracking-tighter"
        >
          Tradição e Esporte em um só lugar
        </motion.p>
      </div>

      {/* Subtle details */}
      <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-4 opacity-10 pointer-events-none">
        <div className="w-1 h-1 bg-zinc-900 rounded-full"></div>
        <div className="w-1 h-1 bg-zinc-900 rounded-full"></div>
        <div className="w-1 h-1 bg-zinc-900 rounded-full"></div>
      </div>
    </div>
  );
}
