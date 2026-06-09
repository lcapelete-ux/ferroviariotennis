import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

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
