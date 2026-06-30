import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface ClubSettings {
  id: string;
  clubName?: string;
  logoUrl?: string | null;
  requireRegisteredPartner?: boolean;
  lastCreditsReset?: string;
  updated_at?: string;
}

interface SettingsContextType {
  settings: ClubSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({ settings: null, loading: true });

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hard failsafe: if Firebase doesn't respond in 5 s, proceed with defaults.
    // This happens when the domain isn't in Firebase Auth's authorized list or
    // when Firestore is unreachable on the first load from GitHub Pages.
    const timeout = setTimeout(() => {
      console.warn('[SettingsContext] Firebase timeout — proceeding without settings.');
      setLoading(false);
    }, 5000);

    const unsub = onSnapshot(
      doc(db, 'settings', 'club_profile'),
      (snap) => {
        clearTimeout(timeout);
        if (snap.exists()) {
          const newData = { id: snap.id, ...(snap.data() as any) };
          setSettings(prev => {
            if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
            return newData;
          });
        }
        setLoading(false);
      },
      (err) => {
        clearTimeout(timeout);
        console.error('[SettingsContext] Firestore error:', err);
        setLoading(false);
      },
    );

    return () => { clearTimeout(timeout); unsub(); };
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
