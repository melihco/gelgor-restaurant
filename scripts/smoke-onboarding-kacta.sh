#!/usr/bin/env bash
# Smoke test: Kaçta (kacta.info) mobile onboarding flow
set -euo pipefail

NEXUS="${NEXUS_URL:-http://127.0.0.1:5050}"
NEXT="${NEXT_URL:-http://127.0.0.1:3000}"
WEBSITE="https://www.kacta.info/"
IG="kacta.info"
EMAIL="${KACTA_SMOKE_EMAIL:-info@kacta.info}"
PASS="${KACTA_SMOKE_PASS:-KactaSmoke2026!}"
COMPANY="Kaçta"

echo "== 0. Health =="
curl -sf "$NEXUS/health" >/dev/null && echo "nexus OK"
curl -sf "$NEXT" >/dev/null && echo "next OK"
curl -sf "http://127.0.0.1:8000/health" >/dev/null && echo "crew OK"

echo "== 1. Register ($EMAIL) =="
REG=$(curl -s -w "\nHTTP:%{http_code}" -X POST "$NEXUS/api/security/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"Mert\",\"tenantName\":\"$COMPANY\"}")
HTTP=$(echo "$REG" | tail -1 | sed 's/HTTP://')
BODY=$(echo "$REG" | sed '$d')
echo "register HTTP=$HTTP"
if [ "$HTTP" != "200" ]; then
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi
TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
TENANT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenantId'])")
echo "tenant=$TENANT"

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "== 2. Save baseline profile =="
SAVE_HTTP=$(curl -s -o /tmp/kacta-save.json -w "%{http_code}" -X PUT "$NEXUS/api/setup/profile" \
  "${AUTH[@]}" \
  -d "{\"brandName\":\"$COMPANY\",\"industry\":\"\",\"location\":\"\",\"brandTone\":\"\",\"targetAudience\":\"\",\"visualStyle\":\"\",\"campaignGoals\":\"\",\"competitors\":\"\",\"customRules\":\"\",\"languages\":\"tr\",\"logoUrl\":\"\",\"websiteUrl\":\"$WEBSITE\",\"description\":\"\",\"defaultApprovalMode\":\"SuggestAndWait\",\"instagramHandle\":\"$IG\",\"contentNeeds\":\"[]\",\"riskRules\":\"{}\",\"customerVisibleSummary\":\"kacta onboarding smoke\"}")
echo "save HTTP=$SAVE_HTTP brandName=$(python3 -c "import json; print(json.load(open('/tmp/kacta-save.json')).get('brandName',''))")"
test "$SAVE_HTTP" = "200"

echo "== 3. Brand discovery =="
DISC_HTTP=$(curl -s -o /tmp/kacta-disc.json -w "%{http_code}" -X POST "$NEXUS/api/setup/brand-discovery" \
  "${AUTH[@]}" \
  -d "{\"websiteUrl\":\"$WEBSITE\",\"instagramHandle\":\"$IG\",\"applyToProfile\":true}")
echo "discovery HTTP=$DISC_HTTP"
python3 << 'PY'
import json, sys
d=json.load(open('/tmp/kacta-disc.json'))
print('success', d.get('success'))
r=d.get('report') or {}
print('industry', r.get('industry'))
p=d.get('profile') or {}
print('profile.industry', p.get('industry'))
print('profile.brandTone', (p.get('brandTone') or '')[:80])
PY
test "$DISC_HTTP" = "200"

echo "== 4. Deep brand setup (Python analyze + theme) =="
SETUP_HTTP=$(curl -s -o /tmp/kacta-setup.json -w "%{http_code}" -X POST "$NEXT/api/onboarding/deep-brand-setup" \
  -H 'Content-Type: application/json' \
  -d "{\"workspaceId\":\"$TENANT\",\"websiteUrl\":\"$WEBSITE\",\"instagramHandle\":\"$IG\",\"brandName\":\"$COMPANY\"}")
echo "deep-brand-setup HTTP=$SETUP_HTTP"
python3 << 'PY'
import json
d=json.load(open('/tmp/kacta-setup.json'))
steps=d.get('steps') or []
failed=[s for s in steps if not s.get('ok')]
print('steps', len(steps), 'failed', [s.get('id') for s in failed])
PY
test "$SETUP_HTTP" = "200"

echo "== 5. Brand readiness =="
curl -sf "$NEXT/api/brand-readiness/$TENANT" \
  -H "x-tenant-id: $TENANT" -H "Authorization: Bearer $TOKEN" \
  -o /tmp/kacta-brs.json
python3 << 'PY'
import json, sys
d=json.load(open('/tmp/kacta-brs.json'))
print('score', d.get('score'))
print('missing', [m.get('id') for m in d.get('missing', [])])
sys.exit(0 if d.get('score', 0) >= 70 else 1)
PY

echo ""
echo "PASS: Kaçta onboarding smoke completed for $EMAIL (tenant=$TENANT)"
