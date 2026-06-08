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
    const unsub = onSnapshot(doc(db, 'settings', 'club_profile'), (snap) => {
      if (snap.exists()) {
        const newData = { id: snap.id, ...(snap.data() as any) };
        setSettings(prev => {
          if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
          return newData;
        });
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching settings:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
