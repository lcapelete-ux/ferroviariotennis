import React from 'react';
import { motion } from 'motion/react';

const CourtLines = () => (
  <svg
    className="absolute inset-0 w-full h-full"
    viewBox="0 0 400 700"
    preserveAspectRatio="xMidYMid slice"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Outer boundary */}
    <rect x="40" y="60" width="320" height="580" stroke="white" strokeOpacity="0.08" strokeWidth="1.5" />
    {/* Net line */}
    <line x1="40" y1="350" x2="360" y2="350" stroke="white" strokeOpacity="0.08" strokeWidth="1.5" />
    {/* Service boxes vertical */}
    <line x1="200" y1="130" x2="200" y2="570" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
    {/* Service lines */}
    <line x1="100" y1="130" x2="300" y2="130" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
    <line x1="100" y1="570" x2="300" y2="570" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
    {/* Singles sidelines */}
    <line x1="100" y1="60" x2="100" y2="640" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
    <line x1="300" y1="60" x2="300" y2="640" stroke="white" strokeOpacity="0.06" strokeWidth="1.5" />
    {/* Center mark */}
    <line x1="195" y1="350" x2="205" y2="350" stroke="white" strokeOpacity="0.12" strokeWidth="2" />
  </svg>
);

const TennisBall = () => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="50" cy="50" r="48" fill="#c8f020" />
    <circle cx="50" cy="50" r="48" fill="url(#ball-shine)" />
    <path d="M12,50 Q12,12 50,12" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" />
    <path d="M50,88 Q88,88 88,50" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" />
    <path d="M12,50 Q12,88 50,88" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    <path d="M50,12 Q88,12 88,50" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    <defs>
      <radialGradient id="ball-shine" cx="35%" cy="35%" r="55%">
        <stop offset="0%" stopColor="white" stopOpacity="0.25" />
        <stop offset="100%" stopColor="transparent" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

export default function PreLoader() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #011a0d 0%, #022b15 50%, #011a0d 100%)' }}
    >
      {/* Court line decoration */}
      <CourtLines />

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(16,120,50,0.18) 0%, transparent 70%)' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center select-none">

        {/* Ball + shadow */}
        <div className="relative w-48 h-40 flex items-end justify-center mb-10">
          <motion.div
            animate={{ scaleX: [1.4, 0.9, 1.4], opacity: [0.35, 0.1, 0.35] }}
            transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-0 w-12 h-3 rounded-full blur-md"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          />
          <motion.div
            className="w-16 h-16 relative"
            animate={{
              y: [0, -110, 0],
              scaleY: [0.72, 1.08, 0.72],
              scaleX: [1.28, 0.92, 1.28],
              rotate: [0, 200, 400],
            }}
            transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut' }}
          >
            <TennisBall />
          </motion.div>
        </div>

        {/* Club name */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-center mb-8"
        >
          <h1
            className="font-black italic uppercase leading-none tracking-[0.18em] mb-1"
            style={{
              fontSize: 'clamp(1.6rem, 6vw, 2.4rem)',
              color: '#c8f020',
              textShadow: '0 0 40px rgba(200,240,32,0.35)',
            }}
          >
            TENNIS FFC
          </h1>
          <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.45em]">
            Ferroviário Futebol Clube
          </p>
        </motion.div>

        {/* Animated loader bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-40 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: '#c8f020' }}
              animate={{ x: ['-100%', '140%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.5em]">
            Preparando as quadras
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
