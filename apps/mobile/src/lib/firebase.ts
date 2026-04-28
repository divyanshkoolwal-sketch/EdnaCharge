import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';

type FirebaseAuthModule = typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
};

const {
  initializeAuth,
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
} = FirebaseAuth;

const firebaseAuth = FirebaseAuth as FirebaseAuthModule;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBzw7_1SbWbZT3U6OpCL_YFEP5949JkTu8',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'ednacharge-a13d8.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'ednacharge-a13d8',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'ednacharge-a13d8.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '312909386856',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:312909386856:ios:35e93ff1038a54329a17dd',
};

function missingFirebaseConfig(): string[] {
  return Object.entries(firebaseConfig)
    .filter(([key, value]) => key !== 'storageBucket' && (!value || value.trim().length === 0))
    .map(([key]) => `EXPO_PUBLIC_FIREBASE_${key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`);
}

export function firebaseConfigError(): string | null {
  const missing = missingFirebaseConfig();
  return missing.length > 0 ? `Missing Firebase config: ${missing.join(', ')}` : null;
}

function app(): FirebaseApp {
  const error = firebaseConfigError();
  if (error) throw new Error(error);
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

let authInstance: FirebaseAuth.Auth | null = null;

export function getFirebaseAuth(): FirebaseAuth.Auth {
  if (authInstance) return authInstance;
  const firebaseApp = app();
  try {
    authInstance = initializeAuth(firebaseApp, {
      persistence: firebaseAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch (err) {
    if (String((err as { code?: string }).code) !== 'auth/already-initialized') throw err;
    authInstance = getAuth(firebaseApp);
  }
  return authInstance;
}

export {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
};

export type FirebaseUser = FirebaseAuth.User;
