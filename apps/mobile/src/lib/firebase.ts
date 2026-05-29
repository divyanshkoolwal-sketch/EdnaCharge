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

// No hardcoded fallbacks: a hardcoded value would silently ship the DEV
// Firebase project into a misconfigured production build. Missing env is caught
// by missingFirebaseConfig() / firebaseConfigError() and fails loudly at boot.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
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
