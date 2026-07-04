/** @file apps/mobile/src/lib/supabase.ts. */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// AUDIT M1: Supabase persists JWT + refresh token via its storage adapter.
// AsyncStorage on iOS/Android is unencrypted at rest; expo-secure-store uses
// Keychain (iOS) / EncryptedSharedPreferences (Android). We also migrate any
// pre-existing AsyncStorage session once on first read and wipe it.
// SecureStore is unavailable on web; fall back to localStorage there.
const secureStorageAdapter: SupportedStorage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    }
    const value = await SecureStore.getItemAsync(key);
    if (value != null) return value;
    // One-time migration from AsyncStorage.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          storage: secureStorageAdapter,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
