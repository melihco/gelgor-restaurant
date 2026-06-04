/** Saved Instagram publish targets per workspace (stored in brand_theme JSON). */

export type MertcafeSavedAccount = {
  id: string;
  label?: string;
};

export function normalizeMertcafeAccountId(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, '');
}

export function parseMertcafeSavedAccounts(raw: unknown): MertcafeSavedAccount[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  const out: MertcafeSavedAccount[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (typeof item === 'string') {
      const id = normalizeMertcafeAccountId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = normalizeMertcafeAccountId(rec.id ?? rec.account_id ?? rec.accountId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = String(rec.label ?? rec.name ?? '').trim() || undefined;
    out.push({ id, label });
  }
  return out;
}

export function mergeMertcafeSavedAccounts(
  existing: MertcafeSavedAccount[],
  next: { id: string; label?: string },
): MertcafeSavedAccount[] {
  const id = normalizeMertcafeAccountId(next.id);
  if (!id) return existing;
  const label = next.label?.trim() || undefined;
  const filtered = existing.filter((a) => a.id !== id);
  return [{ id, label }, ...filtered];
}

export function removeMertcafeSavedAccount(
  existing: MertcafeSavedAccount[],
  accountId: string,
): MertcafeSavedAccount[] {
  const id = normalizeMertcafeAccountId(accountId);
  return existing.filter((a) => a.id !== id);
}

export function accountDisplayLabel(account: MertcafeSavedAccount): string {
  if (account.label?.trim()) return account.label.trim();
  const id = account.id;
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
