#!/usr/bin/env node
/**
 * Reads ngrok's local inspector API and prints CANVA_* lines for .env.local
 * (requires `npm run tunnel:3000` in another terminal).
 */
import http from 'node:http';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

try {
  const j = await fetchJson('http://127.0.0.1:4040/api/tunnels');
  const t = (j.tunnels || []).find((x) => x.proto === 'https') || j.tunnels?.[0];
  if (!t?.public_url) {
    console.error('No HTTPS tunnel found. Run: npm run tunnel:3000');
    process.exit(1);
  }
  const base = String(t.public_url).replace(/\/$/, '');
  console.log('# Paste into apps/web/.env.local and register this redirect URL in the Canva developer portal:');
  console.log('');
  console.log('CANVA_REDIRECT_URI_USE_ENV=true');
  console.log(`CANVA_APP_ORIGIN=${base}`);
  console.log(`CANVA_REDIRECT_URI=${base}/api/canva/oauth/callback`);
  console.log(`CANVA_OAUTH_PUBLIC_REDIRECT_URI=${base}/api/canva/oauth/callback`);
} catch {
  console.error('Cannot reach ngrok (http://127.0.0.1:4040). Start the tunnel: npm run tunnel:3000');
  process.exit(1);
}
