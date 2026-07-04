/** @file apps/mobile/src/state/auth.ts. */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { create } from 'zustand';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type AuthSession = {
  user: AuthUser;
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
  signOut: () => Promise<void>;
};

function toSession(user: SupabaseUser | null | undefined): AuthSession | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name ?? meta.name) as string | undefined;
  const avatarUrl = (meta.avatar_url ?? meta.picture) as string | undefined;
  return {
    user: {
      id: user.id,
      email: user.email ?? '',
      name: typeof name === 'string' ? name : null,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
    },
  };
}

// Google OAuth client config — used by welcome.tsx's expo-auth-session request
// to obtain a Google id_token, which we then hand to Supabase
// signInWithIdToken. (The same client IDs must be registered on the Supabase
// Google provider.)
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
  if (!googleAuthConfig.webClientId) return 'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.';
  if (Platform.OS === 'ios' && !googleAuthConfig.iosClientId)
    return 'Missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.';
  if (Platform.OS === 'ios' && !googleAuthConfig.iosUrlScheme)
    return 'Missing EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME.';
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

/** The configured Supabase client, or throw a clear error if env is missing. */
function client() {
  if (!supabase) throw new Error('Authentication is not configured. Missing Supabase config.');
  return supabase;
}

/** Supabase returns { data, error }; throw so screens can surface it. */
function throwIf(error: { message: string } | null) {
  if (error) throw error;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  error: null,
  setSession: (s) => set({ session: s, loading: false, error: null }),
  signInWithGoogleToken: async (idToken) => {
    const googleError = googleConfigError();
    if (googleError) {
      set({ error: googleError, loading: false });
      throw new Error(googleError);
    }
    const { error } = await client().auth.signInWithIdToken({ provider: 'google', token: idToken });
    throwIf(error);
  },
  signInWithApple: async () => {
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
    // Supabase validates the token's hashed nonce against the rawNonce we pass.
    const { error } = await client().auth.signInWithIdToken({
      provider: 'apple',
      token: result.identityToken,
      nonce: rawNonce,
    });
    throwIf(error);
  },
  signInWithEmail: async (email, password) => {
    const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
    throwIf(error);
  },
  createAccountWithEmail: async (email, password) => {
    const { error } = await client().auth.signUp({ email: email.trim(), password });
    throwIf(error);
  },
  sendPasswordReset: async (email) => {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'ednacharge://reset-password',
    });
    throwIf(error);
  },
  signOut: async () => {
    await client().auth.signOut();
    set({ session: null, error: null });
  },
}));

export async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Force-refresh the Supabase access token. Supabase auto-refreshes, but we call
 * this from the tRPC 401 retry and on AppState `active` so a long-backgrounded
 * app never gets stuck on an expired token.
 */
export async function refreshAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

export function bootstrapAuthListener() {
  if (!supabase) {
    useAuth.setState({ session: null, loading: false, error: 'Authentication is not configured.' });
    return () => undefined;
  }
  const client = supabase;
  // Seed from any persisted session so `loading` resolves even before the first
  // auth event.
  void client.auth.getSession().then(({ data }) => {
    useAuth.getState().setSession(toSession(data.session?.user));
  });
  // Single source of truth for session changes (sign-in, sign-out, token
  // refresh, initial session) via the Supabase auth listener.
  const { data } = client.auth.onAuthStateChange((_event: string, session: Session | null) => {
    useAuth.getState().setSession(toSession(session?.user));
  });
  return () => data.subscription.unsubscribe();
}

export function isGoogleSignInCancel(_error: unknown): boolean {
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
      : '';
  const hay = `${code} ${raw}`.toLowerCase();

  // Anti-enumeration: a wrong password, a non-existent account, and an invalid
  // credential all collapse to ONE generic message on the sign-in path.
  if (hay.includes('invalid_credentials') || hay.includes('invalid login')) {
    return 'The email or password is incorrect.';
  }
  if (hay.includes('already registered') || hay.includes('user_already_exists') || hay.includes('email_exists')) {
    return "We couldn't create that account. If it's yours, try signing in instead.";
  }
  if (hay.includes('weak_password') || hay.includes('password should be')) {
    return 'Use a stronger password.';
  }
  if (hay.includes('email_not_confirmed')) {
    return 'Please confirm your email, then sign in.';
  }
  if (hay.includes('validation') || hay.includes('invalid email') || hay.includes('unable to validate email')) {
    return 'Enter a valid email address.';
  }
  if (hay.includes('rate') || hay.includes('too many')) {
    return 'Too many attempts. Please try again in a moment.';
  }
  if (hay.includes('provider is not enabled') || hay.includes('not enabled')) {
    return 'This sign-in method is not enabled yet. Try another option.';
  }
  return raw;
}
