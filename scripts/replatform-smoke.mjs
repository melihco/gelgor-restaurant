const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = process.env.SMARTAGENCY_TOKEN || '';
const WORKSPACE_ID = process.env.WORKSPACE_ID || '';

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON`);
  }
}

async function main() {
  console.log('Smoke base:', BASE);
  const overview = await fetchJson('/api/admin/platform/overview');
  console.log('overview ok:', overview.currentUser?.tenantName || 'unknown');

  if (WORKSPACE_ID) {
    const brand = await fetchJson(`/api/admin/platform/brand-snapshot?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`);
    console.log('brand snapshot ok:', brand.brandName || 'unknown');
  } else {
    console.log('brand snapshot skipped: set WORKSPACE_ID to verify');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
