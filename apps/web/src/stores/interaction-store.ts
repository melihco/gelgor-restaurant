'use client';

import { create } from 'zustand';
import type { RuntimeTaskTemplate } from '@/lib/agent-runtime';

export interface AssignedTask {
  id: string;
  agentId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAt: string;
  status: 'queued' | 'in_progress' | 'done';
}

export interface InteractionStore {
  showAssignModal: boolean;
  assignTargetAgentId: string | null;
  assignPrefillNote: string;
  assignPreferredTemplateId: string | null;
  showArtifactCenter: boolean;
  selectedArtifactId: string | null;
  assignedTasks: AssignedTask[];
  activeTab: Record<string, string>;
  openAssignModal: (
    agentId: string,
    options?: { prefillNote?: string; preferredTemplateId?: string | null }
  ) => void;
  closeAssignModal: () => void;
  openArtifactCenter: (artifactId?: string | null) => void;
  closeArtifactCenter: () => void;
  selectArtifact: (artifactId: string | null) => void;
  assignTask: (agentId: string, template: RuntimeTaskTemplate, customDesc?: string) => void;
  setAgentTab: (agentId: string, tab: string) => void;
}

export const useInteractionStore = create<InteractionStore>((set) => ({
  showAssignModal: false,
  assignTargetAgentId: null,
  assignPrefillNote: '',
  assignPreferredTemplateId: null,
  showArtifactCenter: false,
  selectedArtifactId: null,
  assignedTasks: [],
  activeTab: {},

  openAssignModal: (agentId, options) =>
    set({
      showAssignModal: true,
      assignTargetAgentId: agentId,
      assignPrefillNote: options?.prefillNote ?? '',
      assignPreferredTemplateId: options?.preferredTemplateId ?? null,
    }),

  closeAssignModal: () =>
    set({
      showAssignModal: false,
      assignTargetAgentId: null,
      assignPrefillNote: '',
      assignPreferredTemplateId: null,
    }),

  openArtifactCenter: (artifactId = null) =>
    set({
      showArtifactCenter: true,
      selectedArtifactId: artifactId,
    }),

  closeArtifactCenter: () =>
    set({
      showArtifactCenter: false,
      selectedArtifactId: null,
    }),

  selectArtifact: (artifactId) =>
    set({
      selectedArtifactId: artifactId,
      showArtifactCenter: true,
    }),

  assignTask: (agentId, template, customDesc) =>
    set((state) => ({
      assignedTasks: [
        {
          id: `at-${Date.now()}`,
          agentId,
          title: template.label,
          description: customDesc ?? template.description,
          priority: template.priority,
          assignedAt: new Date().toISOString(),
          status: 'queued',
        },
        ...state.assignedTasks,
      ],
      showAssignModal: false,
      assignTargetAgentId: null,
      assignPrefillNote: '',
      assignPreferredTemplateId: null,
    })),

  setAgentTab: (agentId, tab) =>
    set((state) => ({
      activeTab: { ...state.activeTab, [agentId]: tab },
    })),
}));
