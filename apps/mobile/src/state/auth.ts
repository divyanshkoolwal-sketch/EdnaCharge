import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  loading: boolean;
  setSession: (s: Session | null) => void;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  setSession: (s) => set({ session: s, loading: false }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));

export function bootstrapAuthListener() {
  supabase.auth.getSession().then(({ data }) => useAuth.getState().setSession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => useAuth.getState().setSession(session));
}
