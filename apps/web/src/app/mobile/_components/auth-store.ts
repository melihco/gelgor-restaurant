'use client';
import { create } from 'zustand';
import type { CurrentUserSecurity } from '@/types';

interface AuthStore {
  user: CurrentUserSecurity | null;
  isChecking: boolean;
  isAuthenticated: boolean;
  showProfile: boolean;
  setUser: (user: CurrentUserSecurity | null) => void;
  setChecking: (v: boolean) => void;
  openProfile: () => void;
  closeProfile: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isChecking: true,
  isAuthenticated: false,
  showProfile: false,
  setUser: (user) => set({ user, isAuthenticated: !!user, isChecking: false }),
  setChecking: (v) => set({ isChecking: v }),
  openProfile: () => set({ showProfile: true }),
  closeProfile: () => set({ showProfile: false }),
}));
