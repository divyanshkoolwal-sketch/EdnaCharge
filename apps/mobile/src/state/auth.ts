import { Platform } from 'react-native';
import {
  getAuth as getNativeFirebaseAuth,
  onAuthStateChanged as onNativeAuthStateChanged,
  signInWithPhoneNumber,
  signOut as nativeFirebaseSignOut,
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  firebaseConfigError,
  getFirebaseAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type FirebaseUser,
} from '../lib/firebase';

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type AuthSession = {
  user: AuthUser;
  firebaseUser: FirebaseUser | FirebaseAuthTypes.User;
};

type AuthState = {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  setSession: (s: AuthSession | null) => void;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccountWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendPhoneCode: (phoneNumber: string) => Promise<FirebaseAuthTypes.ConfirmationResult>;
  confirmPhoneCode: (
    confirmation: FirebaseAuthTypes.ConfirmationResult,
    code: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

function toSession(user: FirebaseUser | null): AuthSession | null {
  if (!user) return null;
  return {
    firebaseUser: user,
    user: {
      id: user.uid,
      email: user.email ?? '',
      name: user.displayName,
      avatarUrl: user.photoURL,
    },
  };
}

function toNativeSession(user: FirebaseAuthTypes.User | null): AuthSession | null {
  if (!user) return null;
  return {
    firebaseUser: user,
    user: {
      id: user.uid,
      email: user.email ?? '',
      name: user.displayName,
      avatarUrl: user.photoURL,
    },
  };
}

export const googleAuthConfig = {
  webClientId:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
    '312909386856-dqs22433oubd3h34tgq6dthgbeq5rkrd.apps.googleusercontent.com',
  iosClientId:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
    '312909386856-k42nfrktnp3epe582hfm2d76h1kljmj1.apps.googleusercontent.com',
  iosUrlScheme:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
    'com.googleusercontent.apps.312909386856-k42nfrktnp3epe582hfm2d76h1kljmj1',
};

function googleConfigError(): string | null {
  if (!googleAuthConfig.webClientId) {
    return 'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.';
  }
  if (Platform.OS === 'ios' && !googleAuthConfig.iosClientId) {
    return 'Missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.';
  }
  if (Platform.OS === 'ios' && !googleAuthConfig.iosUrlScheme) {
    return 'Missing EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME.';
  }
  return null;
}

export function isGoogleSignInConfigured(): boolean {
  return googleConfigError() === null;
}

export function isAppleSignInConfigured(): boolean {
  return Platform.OS === 'ios' && Device.isDevice;
}

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizePhoneNumber(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}

async function assertFirebaseConfig(): Promise<void> {
  const error = firebaseConfigError();
  if (error) throw new Error(error);
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  error: null,
  setSession: (s) => set({ session: s, loading: false, error: null }),
  signInWithGoogleToken: async (idToken) => {
    await assertFirebaseConfig();
    const googleError = googleConfigError();
    if (googleError) {
      set({ error: googleError, loading: false });
      throw new Error(googleError);
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
  },
  signInWithApple: async () => {
    await assertFirebaseConfig();
    if (Platform.OS !== 'ios') throw new Error('Apple sign-in is available on iOS only.');
    if (!Device.isDevice) {
      throw new Error('Apple sign-in needs a physical iPhone for this development build.');
    }
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) throw new Error('Apple sign-in is not available on this device.');

    const rawNonce = nonce();
    const hashedNonce = await sha256(rawNonce);
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!result.identityToken) throw new Error('Apple did not return an identity token.');

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: result.identityToken,
      rawNonce,
    });
    await signInWithCredential(getFirebaseAuth(), credential);
  },
  signInWithEmail: async (email, password) => {
    await assertFirebaseConfig();
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  },
  createAccountWithEmail: async (email, password) => {
    await assertFirebaseConfig();
    await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  },
  sendPasswordReset: async (email) => {
    await assertFirebaseConfig();
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  },
  sendPhoneCode: async (phoneNumber) => {
    await assertFirebaseConfig();
    return signInWithPhoneNumber(getNativeFirebaseAuth(), normalizePhoneNumber(phoneNumber));
  },
  confirmPhoneCode: async (confirmation, code) => {
    await assertFirebaseConfig();
    const credential = await confirmation.confirm(code.trim());
    if (!credential?.user) throw new Error('The verification code could not be confirmed.');
    set({ session: toNativeSession(credential.user), loading: false, error: null });
  },
  signOut: async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
    await nativeFirebaseSignOut(getNativeFirebaseAuth()).catch(() => null);
    set({ session: null, error: null });
  },
}));

export async function getAuthToken(): Promise<string | null> {
  const nativeUser = getNativeFirebaseAuth().currentUser;
  if (nativeUser) return nativeUser.getIdToken();
  if (firebaseConfigError()) return null;
  const user = getFirebaseAuth().currentUser;
  return user ? user.getIdToken() : null;
}

/**
 * Force-refresh the Firebase ID token. Used by:
 *  - The tRPC fetch wrapper after a 401, before retrying.
 *  - The root layout on AppState `active` so a backgrounded app
 *    doesn't get stuck on an expired token after foregrounding.
 */
export async function refreshAuthToken(): Promise<string | null> {
  const nativeUser = getNativeFirebaseAuth().currentUser;
  if (nativeUser) return nativeUser.getIdToken(true);
  if (firebaseConfigError()) return null;
  const user = getFirebaseAuth().currentUser;
  return user ? user.getIdToken(true) : null;
}

export function bootstrapAuthListener() {
  const error = firebaseConfigError();
  if (error) {
    useAuth.setState({ session: null, loading: false, error });
    return () => undefined;
  }

  const unsubNative = onNativeAuthStateChanged(getNativeFirebaseAuth(), (user) => {
    if (user) useAuth.getState().setSession(toNativeSession(user));
  });

  const unsubWeb = onAuthStateChanged(getFirebaseAuth(), (user) => {
    if (!user && getNativeFirebaseAuth().currentUser) return;
    useAuth.getState().setSession(toSession(user));
  });
  return () => {
    unsubNative();
    unsubWeb();
  };
}

export function isGoogleSignInCancel(error: unknown): boolean {
  return false;
}

export function isAuthCancel(error: unknown): boolean {
  if (isGoogleSignInCancel(error)) return true;
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = String((error as { code?: string }).code);
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

export function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Try again.';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : raw;

  if (code.includes('configuration-not-found') || raw.includes('CONFIGURATION_NOT_FOUND')) {
    return 'Firebase Authentication is not initialized for this Firebase project/API key. Open Firebase Console > Authentication, click Get started, then confirm Email/Password is enabled for project ednacharge-a13d8.';
  }
  // Anti-enumeration: never reveal whether an email is registered. A wrong
  // password, a non-existent account, and a disabled/invalid credential all
  // collapse to ONE generic message on the sign-in path.
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'The email or password is incorrect.';
  }
  if (code.includes('email-already-in-use')) {
    // Sign-up path. We can't fully avoid signalling existence here (Firebase
    // rejects the duplicate), but keep it neutral — enable Firebase's
    // "Email enumeration protection" in the console to harden this further.
    return "We couldn't create that account. If it's yours, try signing in instead.";
  }
  if (code.includes('weak-password')) {
    return 'Use a stronger password.';
  }
  if (code.includes('invalid-email')) {
    return 'Enter a valid email address.';
  }
  if (code.includes('invalid-phone-number')) {
    return 'Enter a phone number with country code, like +11234567890.';
  }
  if (code.includes('invalid-verification-code')) {
    return 'The verification code is incorrect.';
  }
  if (code.includes('missing-verification-code')) {
    return 'Enter the verification code.';
  }
  if (code.includes('quota-exceeded')) {
    return 'Firebase SMS quota was exceeded. Use a Firebase test phone number or try later.';
  }
  if (code.includes('operation-not-allowed')) {
    return 'Phone sign-in is not enabled in Firebase Authentication.';
  }
  return raw;
}
