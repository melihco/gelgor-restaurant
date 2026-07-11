/**
 * Platform admin intervention client — tenant-scoped BFF calls with session headers.
 */
import { getRequestContextHeaders, getTenantBffHeaders } from '@/lib/runtime-config';
import type { IntegrationConnection } from '@/types';

export interface AdminActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

function adminHeaders(workspaceId: string): Record<string, string> {
  return getTenantBffHeaders(workspaceId);
}

export async function patchBrandContext(
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/brand-context-data/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: String((data as { detail?: string }).detail ?? res.statusText) };
    }
    return { ok: true, message: 'Marka alanları kaydedildi.', data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Kayıt başarısız' };
  }
}

export async function fetchBrandContext(workspaceId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/brand-context-data/${workspaceId}`, {
      headers: adminHeaders(workspaceId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

export async function aiImproveBrandText(input: {
  workspaceId: string;
  field: string;
  currentText: string;
  instruction?: string;
}): Promise<{ improvedText: string } | { error: string }> {
  try {
    const res = await fetch('/api/admin/ai/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getRequestContextHeaders() },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json().catch(() => ({})) as { improvedText?: string; error?: string };
    if (!res.ok) return { error: data.error ?? `AI düzenleme başarısız (${res.status})` };
    if (!data.improvedText) return { error: 'Boş AI yanıtı' };
    return { improvedText: data.improvedText };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'AI isteği başarısız' };
  }
}

export async function triggerBrandAnalyze(workspaceId: string): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/brand-context/${workspaceId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      body: JSON.stringify({ force: true }),
      signal: AbortSignal.timeout(300_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: String((data as { detail?: string }).detail ?? res.statusText) };
    }
    return { ok: true, message: 'Marka analizi tamamlandı.', data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Analiz başarısız' };
  }
}

export async function triggerMissionPropose(workspaceId: string): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/missions/${workspaceId}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: String((data as { detail?: string }).detail ?? res.statusText) };
    }
    return { ok: true, message: 'Mission önerisi oluşturuldu.', data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Propose başarısız' };
  }
}

export async function triggerMissionAutoPipeline(workspaceId: string): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/missions/${workspaceId}/auto-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: String((data as { error?: string }).error ?? res.statusText) };
    }
    return { ok: true, message: 'Otonom pipeline tetiklendi.', data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Auto-trigger başarısız' };
  }
}

export async function triggerBrandGapCompletion(workspaceId: string): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/brand-context/${workspaceId}/complete-gaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      signal: AbortSignal.timeout(300_000),
    });
    const data = await res.json().catch(() => ({})) as { resolved_count?: number; error?: string };
    if (!res.ok) {
      return { ok: false, message: data.error ?? res.statusText };
    }
    return {
      ok: true,
      message: `${data.resolved_count ?? 0} gap otomatik giderildi.`,
      data,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Gap completion başarısız' };
  }
}

export async function triggerBrandRulesScan(workspaceId: string): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/brand-rules/${workspaceId}/scan`, {
      method: 'POST',
      headers: adminHeaders(workspaceId),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: String((data as { detail?: string }).detail ?? res.statusText) };
    }
    return { ok: true, message: 'Brand rules taraması tamamlandı.', data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Scan başarısız' };
  }
}

export async function fetchAdminIntegrations(workspaceId: string): Promise<IntegrationConnection[]> {
  try {
    const res = await fetch('/api/integrations', {
      headers: adminHeaders(workspaceId),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    return res.json() as Promise<IntegrationConnection[]>;
  } catch {
    return [];
  }
}

export async function fetchAdminQueueStats(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('/api/admin/queue/stats', {
      headers: getRequestContextHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

export async function missionAction(
  workspaceId: string,
  missionId: string,
  action: string,
  method: 'PUT' | 'POST' = 'PUT',
  body?: Record<string, unknown>,
): Promise<AdminActionResult> {
  try {
    const res = await fetch(`/api/missions/${workspaceId}/${missionId}/${action}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...adminHeaders(workspaceId) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message: String((data as { detail?: string; error?: string }).detail
          ?? (data as { error?: string }).error
          ?? res.statusText),
      };
    }
    return { ok: true, message: `${action} tamamlandı.`, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : `${action} başarısız` };
  }
}
