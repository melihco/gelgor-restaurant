'use client';

import { create } from 'zustand';

export type PanelType = 'agent' | 'brief' | 'task' | 'review' | null;

export interface OfficeStore {
  selectedAgentId: string | null;
  selectedZoneId: string | null;
  cameraTarget: [number, number, number];
  cameraPosition: [number, number, number];
  isPanelOpen: boolean;
  panelType: PanelType;
  showActivityFeed: boolean;
  selectAgent: (id: string | null, zoneId?: string | null) => void;
  selectZone: (id: string | null) => void;
  setCameraTarget: (target: [number, number, number]) => void;
  setCameraPosition: (position: [number, number, number]) => void;
  openPanel: (type: PanelType) => void;
  closePanel: () => void;
  toggleActivityFeed: () => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  selectedAgentId: null,
  selectedZoneId: 'zone-command',
  cameraTarget: [0, 2, 0],
  cameraPosition: [0, 12, 20],
  isPanelOpen: false,
  panelType: null,
  showActivityFeed: true,
  selectAgent: (id, zoneId = null) =>
    set({
      selectedAgentId: id,
      selectedZoneId: zoneId,
    }),
  selectZone: (id) =>
    set({
      selectedZoneId: id,
      selectedAgentId: null,
    }),
  setCameraTarget: (target) =>
    set({
      cameraTarget: target,
    }),
  setCameraPosition: (position) =>
    set({
      cameraPosition: position,
    }),
  openPanel: (type) =>
    set({
      panelType: type,
      isPanelOpen: true,
    }),
  closePanel: () =>
    set({
      isPanelOpen: false,
      panelType: null,
    }),
  toggleActivityFeed: () =>
    set((state) => ({
      showActivityFeed: !state.showActivityFeed,
    })),
}));
