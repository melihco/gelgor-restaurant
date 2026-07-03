# Smart Agency — Vercel (web) + Railway (API/crew) deploy

Use this when the **frontend** is on Vercel and **API + Postgres + crew** run on Railway (`gelgor-restaurant` repo).

## Important

- Deploy **`apps/web`** from `melihco/gelgor-restaurant` — **not** the Gel Gör marketing site repo.
- Root `/` redirects to `/mobile` (SmartAgency onboarding). If `/api/nexus-backend/*` returns **404 HTML**, the wrong Vercel project is connected.

## Vercel project settings

| Setting | Value |
|---------|--------|
| Repository | `melihco/gelgor-restaurant` |
| Root Directory | `apps/web` |
| Framework | Next.js |

## Required environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Example | Notes |
|----------|---------|--------|
| `NEXUS_API_URL` | `https://smartagency-api.up.railway.app` | Server-side proxy target (required) |
| `BACKEND_ORIGIN` | same as above | Fallback for rewrites |
| `NEXT_PUBLIC_API_URL` | same as above | Optional; browser can use `/api/nexus-backend` proxy |
| `CREW_BACKEND_URL` | `https://smartagency-crew.up.railway.app` | BFF routes → Python |
| `INTERNAL_API_KEY` | same as Railway | Must match api + crew |
| `NEXT_PUBLIC_USE_DEMO_CONTEXT` | `false` | Production auth |

Set `CREW_BACKEND_URL` and `INTERNAL_API_KEY` before brand analysis / mission routes work.

## Smoke test after deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://YOUR-VERCEL-DOMAIN/api/nexus-backend/security/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","tenantName":"Test"}'
```

Expect **200** (new user) or **409** (email exists). **404 HTML** = wrong repo/root directory.

## Railway

See `docs/railway-deploy.md` and `railway.env.example`.
