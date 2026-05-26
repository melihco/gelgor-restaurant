import type { AgentType } from '@/types';
import { getZoneCopy } from '@/lib/agent-product-catalog';

export type ZoneKind =
  | 'command'
  | 'content'
  | 'design'
  | 'analytics'
  | 'comms'
  | 'ads';

export interface OfficeZoneDef {
  id: string;
  name: string;
  kind: ZoneKind;
  center: [number, number, number];
  size: [number, number];
  accent: string;
  subtitle: string;
}

/**
 * DJ-console-style 3×2 grid.
 * Top row = primary decks, bottom row = secondary channels.
 * Center column = master channel.
 */
export const OFFICE_ZONES: OfficeZoneDef[] = [
  // ── Top row ──
  {
    id: 'zone-content',
    name: getZoneCopy('content').name,
    kind: 'content',
    center: [-8, 0, -2.5],
    size: [7, 5],
    accent: '#a78bfa',
    subtitle: getZoneCopy('content').subtitle,
  },
  {
    id: 'zone-command',
    name: getZoneCopy('command').name,
    kind: 'command',
    center: [0, 0, -2.5],
    size: [7, 5],
    accent: '#fbbf24',
    subtitle: getZoneCopy('command').subtitle,
  },
  {
    id: 'zone-analytics',
    name: getZoneCopy('analytics').name,
    kind: 'analytics',
    center: [8, 0, -2.5],
    size: [7, 5],
    accent: '#34d399',
    subtitle: getZoneCopy('analytics').subtitle,
  },
  // ── Bottom row ──
  {
    id: 'zone-design',
    name: getZoneCopy('design').name,
    kind: 'design',
    center: [-8, 0, 3.5],
    size: [7, 4.5],
    accent: '#f472b6',
    subtitle: getZoneCopy('design').subtitle,
  },
  {
    id: 'zone-ads',
    name: getZoneCopy('ads').name,
    kind: 'ads',
    center: [0, 0, 3.5],
    size: [7, 4.5],
    accent: '#818cf8',
    subtitle: getZoneCopy('ads').subtitle,
  },
  {
    id: 'zone-comms',
    name: getZoneCopy('comms').name,
    kind: 'comms',
    center: [8, 0, 3.5],
    size: [7, 4.5],
    accent: '#38bdf8',
    subtitle: getZoneCopy('comms').subtitle,
  },
];

export interface FlagshipAgentLayout {
  id: string;
  name: string;
  type: AgentType;
  roleLabel: string;
  zoneId: string;
  position: [number, number, number];
  rotationY: number;
}

export const FLAGSHIP_AGENTS: FlagshipAgentLayout[] = [
  // Command (master deck) — dual turntables
  { id: 'agent-ceo',       name: 'Helm',   type: 'manager',    roleLabel: 'Operasyon Koordinatoru', zoneId: 'zone-command',   position: [-1.5, 0, -2.5], rotationY: 0 },
  { id: 'agent-review',    name: 'Vellum', type: 'manager',    roleLabel: 'Yorum Yonetimi',         zoneId: 'zone-command',   position: [1.5, 0, -2.5],  rotationY: 0 },
  // Content — single platter
  { id: 'agent-blog',      name: 'Nova',   type: 'writer',     roleLabel: 'Icerik Yazari',          zoneId: 'zone-content',   position: [-8, 0, -2.5],   rotationY: 0 },
  // Design — dual turntables
  { id: 'agent-social',    name: 'Pixel',  type: 'designer',   roleLabel: 'Sosyal Tasarim',         zoneId: 'zone-design',    position: [-9.5, 0, 3.5],  rotationY: 0 },
  { id: 'agent-ig',        name: 'Flux',   type: 'designer',   roleLabel: 'Instagram Icerik',       zoneId: 'zone-design',    position: [-6.5, 0, 3.5],  rotationY: 0 },
  // Analytics — dual turntables
  { id: 'agent-seo',       name: 'Orbit',  type: 'researcher', roleLabel: 'SEO Uzmani',             zoneId: 'zone-analytics', position: [6.5, 0, -2.5],  rotationY: 0 },
  { id: 'agent-analytics', name: 'Lens',   type: 'analyst',    roleLabel: 'Performans Analisti',    zoneId: 'zone-analytics', position: [9.5, 0, -2.5],  rotationY: 0 },
  // Comms — single platter
  { id: 'agent-chatbot',   name: 'Cipher', type: 'developer',  roleLabel: 'Iletisim Otomasyonu',   zoneId: 'zone-comms',     position: [8, 0, 3.5],     rotationY: 0 },
  // Ads — single platter
  { id: 'agent-ads',       name: 'Spark',  type: 'developer',  roleLabel: 'Reklam Analisti',        zoneId: 'zone-ads',       position: [0, 0, 3.5],     rotationY: 0 },
];

export const AGENT_FLOW_EDGES: [string, string][] = [
  ['agent-ceo', 'agent-review'],
  ['agent-blog', 'agent-review'],
  ['agent-social', 'agent-ig'],
  ['agent-seo', 'agent-blog'],
  ['agent-analytics', 'agent-ceo'],
  ['agent-chatbot', 'agent-ceo'],
  ['agent-ads', 'agent-analytics'],
  ['agent-review', 'agent-blog'],
];

export function zoneById(id: string): OfficeZoneDef | undefined {
  return OFFICE_ZONES.find((z) => z.id === id);
}

export function agentLayoutById(id: string): FlagshipAgentLayout | undefined {
  return FLAGSHIP_AGENTS.find((a) => a.id === id);
}
