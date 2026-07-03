import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * AsyncStorage-shaped storage backed by the OS keychain (expo-secure-store:
 * iOS Keychain / Android Keystore) — for the Firebase JS Auth SDK's
 * `getReactNativePersistence`, so refresh/ID tokens are NOT left in
 * unencrypted AsyncStorage.
 *
 * Two real-world constraints handled here:
 *  1. SecureStore keys must match [A-Za-z0-9._-]. Firebase keys contain ':'
 *     (e.g. "firebase:authUser:<apiKey>:[DEFAULT]"), so we sanitize the key to
 *     a safe, stable token.
 *  2. SecureStore values are capped (~2KB on iOS). A serialized Firebase user
 *     can exceed that, so we transparently chunk values across multiple keys
 *     and store a small header describing the chunk count.
 *
 * Every method is fail-safe: a read error returns null (→ treated as
 * "logged out", recoverable) and a write error is swallowed rather than
 * crashing auth init. A one-time migration moves any pre-existing AsyncStorage
 * value into SecureStore on first read, then deletes the plaintext copy.
 */

const CHUNK_SIZE = 1800; // under the ~2KB SecureStore value cap, with headroom.

/** Map an arbitrary storage key to a SecureStore-legal, collision-resistant key. */
export function safeKey(key: string): string {
  // Replace any disallowed char with '_' and append a short stable hash of the
  // original so distinct keys can't collide after sanitization.
  const sanitized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return `edna_${sanitized}_${(h >>> 0).toString(36)}`.slice(0, 110);
}

const headerKey = (k: string) => `${safeKey(k)}__h`;
const chunkKey = (k: string, i: number) => `${safeKey(k)}__${i}`;

export const secureAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const header = await SecureStore.getItemAsync(headerKey(key));
      if (header != null) {
        const count = Number(header);
        if (!Number.isFinite(count) || count <= 0) return null;
        let out = '';
        for (let i = 0; i < count; i += 1) {
          const part = await SecureStore.getItemAsync(chunkKey(key, i));
          if (part == null) return null; // torn write — treat as absent
          out += part;
        }
        return out;
      }
      // One-time migration: pull any legacy plaintext value out of AsyncStorage,
      // move it into SecureStore, then wipe the plaintext copy.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await secureAsyncStorage.setItem(key, legacy);
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacy;
      }
      return null;
    } catch {
      return null; // fail-safe: behave as "no session" rather than crash
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      // Remove any prior chunks beyond what we're about to write.
      await secureAsyncStorage.removeItem(key);
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      if (chunks.length === 0) chunks.push('');
      for (let i = 0; i < chunks.length; i += 1) {
        await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]!);
      }
      await SecureStore.setItemAsync(headerKey(key), String(chunks.length));
    } catch {
      /* swallow: a failed persist degrades to "not remembered", not a crash */
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const header = await SecureStore.getItemAsync(headerKey(key));
      const count = header != null ? Number(header) : 0;
      for (let i = 0; i < count; i += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
      }
      await SecureStore.deleteItemAsync(headerKey(key)).catch(() => {});
    } catch {
      /* ignore */
    }
  },
};
