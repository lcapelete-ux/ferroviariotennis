import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, updateDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { UserProfile } from '../types';
import { getPreviousSunday12PM } from '../utils/bookingRules';
import { isBefore } from 'date-fns';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, error: null });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setError(null);
        setUser(currentUser);
        
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }

        if (currentUser) {
          const isAdminEmail = currentUser.email === 'tennisffc2@gmail.com';
          const userDocRef = doc(db, 'users', currentUser.uid);

          // Subscribe to profile changes
          unsubProfile = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              const newData = docSnap.data() as UserProfile;
              setProfile(prev => {
                if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
                return newData;
              });
              setLoading(false);
            }
          }, (err) => {
            console.error('Profile Snapshot Error:', err);
            setError('Erro ao sincronizar perfil em tempo real.');
            setLoading(false);
          });

          // Initial check and auto-creation
          try {
            const docSnap = await getDoc(userDocRef);
            
            if (docSnap.exists()) {
              const profileData = docSnap.data() as UserProfile;
              // Ensure admin email always has admin role
              if (isAdminEmail && profileData.role !== 'admin') {
                await updateDoc(userDocRef, { role: 'admin' });
              }
              setProfile(prev => {
                if (JSON.stringify(prev) === JSON.stringify(profileData)) return prev;
                return profileData;
              });
              
              // New: Automatic Credit Reset Logic (Triggered by server, with client-side fallback)
              const triggerResetCheck = async () => {
                try {
                  console.log('[AUTO-RESET] Checking credits renewal...');
                  // Attempt server-side first
                  const response = await fetch('/api/check-reset', { method: 'POST' });
                  const result = await response.json();
                  
                  if (result.success && !result.skip) {
                    console.log(`[AUTO-RESET] Renovação concluída via servidor: ${result.count} usuários.`);
                  } else {
                    // Fallback to client-side reset for ANY user if server fails
                    // Since firestore rules allow ANY authenticated user to update 'credits' field,
                    // we can trigger the reset logic right here.
                    const { doc, getDoc, getDocs, collection, writeBatch } = await import('firebase/firestore');
                    const { db } = await import('../firebase');
                    
                    const settingsRef = doc(db, 'settings', 'club_profile');
                    const settingsSnap = await getDoc(settingsRef);
                    const settingsData = settingsSnap.exists() ? settingsSnap.data() : { lastCreditsReset: '1970-01-01T00:00:00Z' };
                    
                    const lastResetStr = settingsData.lastCreditsReset || '1970-01-01T00:00:00Z';
                    const lastReset = new Date(lastResetStr);
                    
                    // Milestone check for client fallback
                    const now = new Date();
                    const nowStr = now.toISOString();

                    const m11 = new Date(now);
                    m11.setHours(11, 0, 0, 0);
                    const day = m11.getDay();
                    m11.setDate(m11.getDate() - day); // Current/Last Sunday 11:00

                    const m12 = new Date(now);
                    m12.setHours(12, 0, 0, 0);
                    m12.setDate(m12.getDate() - (m12.getDay())); // Current/Last Sunday 12:00

                    // Before Sunday 11:00, use last week
                    if (now.getDay() === 0 && now.getHours() < 11) {
                      m11.setDate(m11.getDate() - 7);
                      m12.setDate(m12.getDate() - 7);
                    } else if (now.getDay() === 0 && now.getHours() < 12) {
                      m12.setDate(m12.getDate() - 7);
                    }

                    let targetMilestone = m11;
                    let targetAmount = 0;
                    if (m12 > m11) {
                      targetMilestone = m12;
                      targetAmount = 3;
                    }

                    if (lastReset < targetMilestone) {
                      console.log(`[AUTO-RESET] Iniciando reset via cliente (Fallback)... Target Milestone: ${targetMilestone.toISOString()} (Amount: ${targetAmount})`);
                      
                      const usersSnap = await getDocs(collection(db, 'users'));
                      const batch = writeBatch(db);
                      let count = 0;
                      
                      usersSnap.docs.forEach(uDoc => {
                        const data = uDoc.data();
                        if (data.role === 'professor' || data.role === 'admin') {
                          if (data.credits !== 99) {
                            batch.update(uDoc.ref, { credits: 99, updated_at: nowStr });
                          }
                        } else {
                          // Standard users reset to exactly targetAmount (0 at 11h, 3 at 12h)
                          batch.update(uDoc.ref, { credits: targetAmount, updated_at: nowStr });
                          count++;
                        }
                      });
                      
                      batch.set(settingsRef, { 
                        lastCreditsReset: nowStr,
                        updated_at: nowStr
                      }, { merge: true });
                      
                      await batch.commit();
                      console.log(`[AUTO-RESET] Sucesso fallback: ${count} usuários resetados para ${targetAmount} (menos fixos).`);
                    } else {
                      console.log('[AUTO-RESET] Já atualizado para este ciclo. Último reset:', lastReset.toISOString());
                    }
                  }
                } catch (resetErr) {
                  console.error('[AUTO-RESET] Erro ao disparar reset:', resetErr);
                }
              };
              triggerResetCheck();

              setLoading(false);
            } else {
              // If not found, auto-create profile
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                fullName: currentUser.displayName || 'Sócio Tennis FFC',
                phone: currentUser.phoneNumber || '',
                role: isAdminEmail ? 'admin' : 'user',
                credits: 3,
                noShowCount: 0,
                created_at: new Date().toISOString(),
              };
              
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
              setLoading(false);
            }
          } catch (err: any) {
            console.error('Error during profile check/creation:', err);
            setError(err.message || 'Erro ao carregar ou criar perfil.');
            setLoading(false);
          }
        } else {
          setProfile(null);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Auth Context Error:', err);
        setError(err.message || 'Erro ao carregar perfil do usuário.');
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};
