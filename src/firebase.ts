import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, getDocFromServer, doc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Messaging disabled as per user request
export let messaging: any = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    // Profile creation is now handled by AuthContext.tsx to avoid race conditions
  } catch (error: any) {
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-by-user') {
      console.error("Error signing in with Google", error);
    }
    throw error;
  }
};

export const registerWithPhoneAndPassword = async (fullName: string, phone: string, pass: string) => {
  // Limpar o telefone para usar como identificador único (apenas números)
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Se o número tiver 12 ou 13 dígitos (ex: 55119...), removemos o 55 inicial
  if (cleanPhone.length > 11 && cleanPhone.startsWith('55')) {
    cleanPhone = cleanPhone.substring(2);
  }

  if (cleanPhone.length < 10) {
    throw new Error("Número de telefone inválido. Use o formato (00) 00000-0000");
  }

  // Criamos um e-mail técnico para o Firebase Auth baseado no telefone
  const email = `${cleanPhone}@tennisffc.com`;
  
  try {
    // 1. Criar a conta no Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    
    // 2. Atualizar o nome de exibição no Auth
    await updateProfile(user, { displayName: fullName });

    // 3. Criar o perfil no Firestore
    const { setDoc, doc } = await import('firebase/firestore');
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, {
      uid: user.uid,
      fullName: fullName,
      phone: phone,
      role: 'user',
      credits: 3,
      noShowCount: 0,
      created_at: new Date().toISOString(),
    });
    
    return user;
  } catch (error: any) {
    console.error("Erro no registro:", error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error("Este número de celular já está cadastrado.");
    }
    throw error;
  }
};

export const loginWithPhoneAndPassword = async (phone: string, pass: string) => {
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Se o número tiver 12 ou 13 dígitos (ex: 55119...), removemos o 55 inicial
  if (cleanPhone.length > 11 && cleanPhone.startsWith('55')) {
    cleanPhone = cleanPhone.substring(2);
  }

  const email = `${cleanPhone}@tennisffc.com`;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error: any) {
    console.error("Error logging in with phone", error);
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error("O login por E-mail/Senha não está ativado no Console do Firebase. Por favor, ative-o em Authentication > Sign-in Method.");
    }
    throw error;
  }
};

export const signInAdminLocal = async () => {
  try {
    const result = await signInAnonymously(auth);
    
    // Garantir que o perfil anônimo do admin local tenha o papel de 'admin' no Firestore
    const { setDoc, doc } = await import('firebase/firestore');
    const userDocRef = doc(db, 'users', result.user.uid);
    
    await setDoc(userDocRef, {
      uid: result.user.uid,
      fullName: 'Administrador Local',
      role: 'admin',
      created_at: new Date().toISOString(),
    }, { merge: true });

    return result.user;
  } catch (error) {
    console.error("Error signing in anonymously", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined') return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return null;
    }
    return 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
};
