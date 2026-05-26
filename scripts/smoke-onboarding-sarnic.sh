#!/usr/bin/env bash
# Smoke test: mobile onboarding persistence for Sarnıç Beach
set -euo pipefail

NEXUS="${NEXUS_URL:-http://127.0.0.1:5050}"
NEXT="${NEXT_URL:-http://127.0.0.1:3000}"
WEBSITE="https://www.sarnicbeach.com/"
IG="sarnicbeach"
EMAIL="smoke-$(date +%s)@sarnicbeach-test.local"
PASS="testpass123"

echo "== 1. Register =="
REG=$(curl -sf -X POST "$NEXUS/api/security/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"Smoke Test\",\"tenantName\":\"Sarnic Beach\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
TENANT=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenantId'])")
echo "tenant=$TENANT"

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "== 2. Save baseline (string enum like frontend) =="
SAVE_HTTP=$(curl -s -o /tmp/save.json -w "%{http_code}" -X PUT "$NEXUS/api/setup/profile" \
  "${AUTH[@]}" \
  -d "{\"brandName\":\"Sarnic Beach\",\"industry\":\"\",\"location\":\"\",\"brandTone\":\"\",\"targetAudience\":\"\",\"visualStyle\":\"\",\"campaignGoals\":\"\",\"competitors\":\"\",\"customRules\":\"\",\"languages\":\"tr\",\"logoUrl\":\"\",\"websiteUrl\":\"$WEBSITE\",\"description\":\"\",\"defaultApprovalMode\":\"SuggestAndWait\",\"instagramHandle\":\"$IG\",\"contentNeeds\":\"[]\",\"riskRules\":\"{}\",\"customerVisibleSummary\":\"onboarding smoke\"}")
echo "save HTTP=$SAVE_HTTP brandName=$(python3 -c "import json; print(json.load(open('/tmp/save.json')).get('brandName',''))")"
test "$SAVE_HTTP" = "200"

echo "== 3. Brand discovery applyToProfile =="
DISC_HTTP=$(curl -s -o /tmp/disc.json -w "%{http_code}" -X POST "$NEXUS/api/setup/brand-discovery" \
  "${AUTH[@]}" \
  -d "{\"websiteUrl\":\"$WEBSITE\",\"instagramHandle\":\"$IG\",\"applyToProfile\":true}")
echo "discovery HTTP=$DISC_HTTP"
python3 << 'PY'
import json
d=json.load(open('/tmp/disc.json'))
print('success', d.get('success'))
r=d.get('report') or {}
print('industry', r.get('industry'))
print('brandTone', r.get('brandTone'))
p=d.get('profile') or {}
print('profile.industry', p.get('industry'))
print('profile.brandTone', p.get('brandTone'))
print('profile.description len', len(p.get('description') or ''))
PY
test "$DISC_HTTP" = "200"

echo "== 4. GET profile (Brand Constitution source) =="
curl -sf "$NEXUS/api/setup/profile" -H "Authorization: Bearer $TOKEN" -o /tmp/profile.json
python3 << 'PY'
import json, sys
d=json.load(open('/tmp/profile.json'))
checks = {
  'brandName': d.get('brandName'),
  'industry': d.get('industry'),
  'brandTone': d.get('brandTone'),
  'websiteUrl': d.get('websiteUrl'),
  'instagramHandle': d.get('instagramHandle'),
}
for k,v in checks.items():
  ok = bool(str(v or '').strip())
  print(f"  {k}: {repr(v)[:80]} {'OK' if ok else 'EMPTY'}")
desc = d.get('description') or ''
print(f"  description len: {len(desc)} {'OK' if len(desc)>50 else 'SHORT'}")
fail = not checks['brandName'] or not checks['industry'] or not checks['brandTone']
sys.exit(1 if fail else 0)
PY

echo "== 5. Python brand analyze via Next BFF =="
ANALYZE_HTTP=$(curl -s -o /tmp/analyze.json -w "%{http_code}" -X POST "$NEXT/api/brand-context/$TENANT/analyze" \
  -H 'Content-Type: application/json' \
  -d "{\"website_url\":\"$WEBSITE\",\"instagram_handle\":\"$IG\"}")
echo "analyze HTTP=$ANALYZE_HTTP"
python3 << 'PY'
import json
d=json.load(open('/tmp/analyze.json'))
refs=d.get('reference_image_urls') or []
print('reference_images', len(refs))
print('inferred_industry', d.get('inferred_industry'))
ctx=d.get('brand_context') or {}
print('ctx.business_name', ctx.get('business_name'))
PY
test "$ANALYZE_HTTP" = "200"

echo ""
echo "PASS: onboarding smoke test completed for $EMAIL"
