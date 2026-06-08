import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

import { useSettings } from '../context/SettingsContext';

const LogoCrest = ({ customLogoUrl, showDefault = false }: { customLogoUrl?: string | null, showDefault?: boolean }) => {
  const [imageError, setImageError] = useState(false);

  // If we don't have a logo and don't want to show default yet, return nothing to prevent flash
  if (!customLogoUrl && !showDefault) return <div className="h-32 mb-8" />;

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
      className="relative w-48 h-32 mb-8 drop-shadow-2xl"
    >
      {customLogoUrl && !imageError ? (
        <div className="w-full h-full flex items-center justify-center p-2">
          <img 
            src={customLogoUrl} 
            alt="Logo" 
            className="max-w-full max-h-full object-contain drop-shadow-xl" 
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        /* Default Crest */
        <div className="relative w-full h-full bg-gradient-to-b from-[#e6c986] via-[#b8860b] to-[#7a590a] rounded-[50%] p-[4px] shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
          <div className="w-full h-full rounded-[50%] bg-[#002b15] p-[2px]">
            <div className="w-full h-full rounded-[50%] bg-gradient-to-br from-[#f9f2d1] via-[#d4af37] to-[#8b6d1b] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-black/20 pointer-events-none"></div>
              <div className="flex flex-col items-center">
                <span className="text-[#004b23] font-serif text-6xl md:text-7xl font-bold italic tracking-tighter drop-shadow-[0_2px_1px_rgba(255,255,255,0.5)] select-none leading-none">
                  FFC
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default function Landing() {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);
  const { settings } = useSettings();

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => {
      navigate('/login');
    }, 800);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#9c4221] font-sans flex flex-col items-center justify-center overflow-hidden selection:bg-[#004b23] selection:text-white">
      
      {/* 1. Camada de Textura de Papel (Saibro) */}
      <div className="absolute inset-0 opacity-40 pointer-events-none" 
           style={{ 
             backgroundImage: 'url("https://www.transparenttextures.com/patterns/natural-paper.png")',
             backgroundBlendMode: 'multiply'
           }} />
      
      {/* 2. Camada de Pontos sutil (Grit/Granulação) */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', 
             backgroundSize: '20px 20px' 
           }} />

      {/* 3. Vignette Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.3)_100%)] pointer-events-none"></div>

      {/* 4. Court Lines marking (Subtle) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none p-6 md:p-16 lg:p-24">
        <div className="w-full h-full border-[1.5px] border-white/80 relative flex items-center justify-center">
          <div className="absolute w-[1.5px] h-full bg-white/70"></div>
          <div className="absolute h-[1.5px] w-full bg-white/70"></div>
          <div className="absolute w-[85%] h-full border-x-[1.5px] border-white/60"></div>
          <div className="absolute h-[85%] w-full border-y-[1.5px] border-white/60"></div>
        </div>
      </div>

      <AnimatePresence>
        {!isExiting && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 flex flex-col items-center text-center max-w-6xl w-full px-6"
          >
            <LogoCrest customLogoUrl={settings?.logoUrl} showDefault={!!settings && !settings.logoUrl} />

            <div className="space-y-6 mb-16 md:mb-20">
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 1 }}
                className="text-5xl md:text-8xl lg:text-9xl font-serif text-[#faf7f2] tracking-tight leading-[0.95] drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]"
              >
                Exclusividade e Tradição
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="text-2xl md:text-5xl lg:text-6xl font-serif italic text-[#faf7f2]/80 drop-shadow-lg"
              >
                na quadra de saibro.
              </motion.p>
            </div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[#faf7f2] text-[10px] md:text-sm font-sans font-bold uppercase tracking-[0.4em]">Área do Tenista</p>
                <p className="text-[#faf7f2]/40 text-[9px] md:text-xs font-sans uppercase tracking-[0.2em] font-medium leading-none">
                  {settings?.clubName || "Ferroviário Futebol Clube"}
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.02, backgroundColor: "#ffffff" }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEnter}
                className="bg-[#faf7f2]/95 text-[#004b23] px-8 py-2.5 rounded-full font-sans font-bold text-[10px] md:text-xs uppercase tracking-[0.2em] shadow-lg transition-all duration-300 border border-white/10"
              >
                Acessar Clube
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1.5 }}
        className="absolute bottom-10 left-0 right-0 text-center px-6"
      >
        <p className="text-[#faf7f2]/70 text-[10px] md:text-xs lg:text-sm font-serif italic uppercase tracking-[0.4em]">
          Mantenha o Silêncio <span className="mx-4 opacity-40">•</span> Respeite a Etiqueta <span className="mx-4 opacity-40">•</span> Jogue com Honra
        </p>
      </motion.div>

      {/* Transition Overlay */}
      <AnimatePresence>
        {isExiting && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: "circIn" }}
            className="fixed inset-0 bg-[#004b23] z-[100]"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
