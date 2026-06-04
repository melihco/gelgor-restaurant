#!/usr/bin/env node
/**
 * Smoke test: Mertcafe publish proxy + account_id resolution.
 * Usage: node scripts/test-mertcafe-publish.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env.local');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000';
const TENANT = '5feb36f7-def7-4b4a-834f-353457de57bf';
const EXPECT_ACCOUNT = env.MERTCAFE_INSTAGRAM_ACCOUNT_ID || '6a200e8e2b2567671aae';

console.log('Expected account_id:', EXPECT_ACCOUNT);
console.log('Mertcafe API key set:', Boolean(env.MERTCAFE_API_KEY));

// 1) Direct upstream (what our proxy sends)
const upstreamPayload = {
  api_key: env.MERTCAFE_API_KEY,
  account_id: EXPECT_ACCOUNT,
  platform: 'instagram',
  post_type: 'story',
  image_url: 'https://picsum.photos/1080/1920',
};
const mertBase = env.MERTCAFE_BASE_URL || 'https://web-production-02d278.up.railway.app';
console.log('\n--- Direct Mertcafe POST ---');
const upRes = await fetch(`${mertBase}/api/post`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(upstreamPayload),
  signal: AbortSignal.timeout(30_000),
});
const upJson = await upRes.json().catch(() => ({}));
console.log('Status:', upRes.status);
console.log('Body:', JSON.stringify(upJson).slice(0, 400));

// 2) Next proxy
console.log('\n--- Next /api/mertcafe/post ---');
const proxyRes = await fetch(`${BASE}/api/mertcafe/post`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    post_type: 'story',
    workspaceId: TENANT,
    image_url: 'https://picsum.photos/1080/1920',
  }),
  signal: AbortSignal.timeout(60_000),
});
const proxyJson = await proxyRes.json().catch(() => ({}));
console.log('Status:', proxyRes.status);
console.log('Body:', JSON.stringify(proxyJson).slice(0, 400));

const err = String(proxyJson.error || '');
if (proxyRes.ok) {
  const postId = proxyJson.post_id || proxyJson.data?.post?._id;
  console.log('\n✓ Next proxy publish OK', postId ? `(post_id=${postId})` : '');
  process.exit(0);
}
if (/already scheduled|already posted|24 hours/i.test(err)) {
  console.log('\n✓ Account id accepted (duplicate content guard only)');
  process.exit(0);
}
if (err.includes('aaeadff')) {
  console.log('\n✗ Mertcafe still uses old stored account (aaeadff) — check MERTCAFE_INSTAGRAM_ACCOUNT_ID');
  process.exit(1);
}
console.log('\n✗ Publish failed:', err || proxyRes.status);
process.exit(1);
