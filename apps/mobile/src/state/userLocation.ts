// Tiny store so the charger detail screen can compute distance from the user
// without re-asking for location permission. The driver map writes the user's
// last known coords here on mount; downstream screens read.
import { create } from 'zustand';

type Coords = { lat: number; lng: number };

type UserLocationState = {
  coords: Coords | null;
  set: (c: Coords) => void;
};

export const useUserLocation = create<UserLocationState>((set) => ({
  coords: null,
  set: (c) => set({ coords: c }),
}));
