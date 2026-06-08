import React from 'react';
import { motion } from 'motion/react';

const TennisBall = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    className={className}
  >
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

export default function PreLoader() {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#bc4a3a]"
    >
      {/* Clay Texture/Overlay */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-overlay pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/p6.png')]" />
      
      <div className="relative z-20 flex flex-col items-center">
        <div className="relative w-64 h-32 flex items-end justify-center mb-8">
          {/* Animated Shadow */}
          <motion.div 
            animate={{ 
              scaleX: [1, 0.4, 1],
              opacity: [0.4, 0.1, 0.4],
            }}
            transition={{ 
              duration: 0.6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute bottom-[-10px] w-14 h-3 bg-black/30 rounded-full blur-md"
          />

          {/* Bouncing Tennis Ball */}
          <motion.div 
            animate={{ 
              y: [0, -120, 0],
              rotate: [0, 180, 360],
              scaleY: [0.7, 1.1, 0.7],
              scaleX: [1.3, 0.9, 1.3],
            }}
            transition={{ 
              duration: 0.6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="relative"
          >
            <TennisBall size={72} className="drop-shadow-[0_15px_15px_rgba(0,0,0,0.4)]" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <h2 className="text-[#ccff00] font-sans text-4xl font-black italic tracking-[0.25em] uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
            TENNIS FFC
          </h2>
          <div className="mt-4 flex flex-col items-center">
            <p className="text-white/80 text-[11px] font-bold tracking-[0.4em] uppercase mb-3">
              Preparando as quadras
            </p>
            <div className="w-32 h-1 bg-black/20 rounded-full overflow-hidden">
               <motion.div 
                className="h-full bg-[#ccff00]"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
               />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
