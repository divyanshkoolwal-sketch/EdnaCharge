/** @file apps/mobile/src/state/role.ts. */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'driver' | 'host';
type RoleState = {
  role: Role;
  hydrated: boolean;
  setRole: (r: Role) => void;
  clearRole: () => void;
  hydrate: () => Promise<void>;
};

const KEY = 'edna.lastRole';

export const useRole = create<RoleState>((set) => ({
  role: 'driver',
  hydrated: false,
  setRole: (r) => {
    set({ role: r, hydrated: true });
    void AsyncStorage.setItem(KEY, r);
  },
  clearRole: () => {
    set({ role: 'driver', hydrated: true });
    void AsyncStorage.removeItem(KEY);
  },
  hydrate: async () => {
    try {
      const r = (await AsyncStorage.getItem(KEY)) as Role | null;
      set({ role: r === 'driver' || r === 'host' ? r : 'driver', hydrated: true });
    } catch {
      set({ role: 'driver', hydrated: true });
    }
  },
}));
