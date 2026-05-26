'use client';

import { create } from 'zustand';

export type AppPage =
  | 'dashboard'
  | 'setup'
  | 'agents'
  | 'outputs'
  | 'approvals'
  | 'executions'
  | 'billing'
  | 'reviews'
  | 'content'
  | 'brand'
  | 'ads'
  | 'visitors'
  | 'seo'
  | 'readiness'
  | 'reports'
  | 'settings';

export interface NavigationStore {
  currentPage: AppPage;
  setupRequired: boolean;
  navigate: (page: AppPage) => void;
  setSetupRequired: (required: boolean) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentPage: 'dashboard',
  setupRequired: false,
  navigate: (page) => set({ currentPage: page }),
  setSetupRequired: (required) => set({ setupRequired: required }),
}));
