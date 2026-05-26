'use client';

import { create } from 'zustand';

export interface ActivityItem {
  id: string;
  subject: string;
  action: string;
  timestamp: string;
  accentColor: string;
}

interface ActivityStore {
  items: ActivityItem[];
  addActivity: (item: ActivityItem) => void;
  clearActivities: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  items: [],
  addActivity: (item) =>
    set((state) => ({
      items: [item, ...state.items].slice(0, 30),
    })),
  clearActivities: () => set({ items: [] }),
}));
