import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
export const runtime = 'nodejs';
export const maxDuration = 60;

// GET → list templates, POST → seed templates
export async function GET() {
  return proxyToCrewBackend('/api/v1/brand-context/shotstack/templates/list', { method: 'GET', timeoutMs: 15_000 });
}
export async function POST() {
  return proxyToCrewBackend('/api/v1/brand-context/shotstack/templates/seed', { body: {}, timeoutMs: 55_000 });
}
