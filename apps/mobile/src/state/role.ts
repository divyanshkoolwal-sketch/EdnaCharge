import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'driver' | 'host';
type RoleState = {
  role: Role;
  setRole: (r: Role) => void;
  hydrate: () => Promise<void>;
};

const KEY = 'edna.lastRole';

export const useRole = create<RoleState>((set) => ({
  role: 'driver',
  setRole: (r) => {
    set({ role: r });
    void AsyncStorage.setItem(KEY, r);
  },
  hydrate: async () => {
    const r = (await AsyncStorage.getItem(KEY)) as Role | null;
    if (r === 'driver' || r === 'host') set({ role: r });
  },
}));
