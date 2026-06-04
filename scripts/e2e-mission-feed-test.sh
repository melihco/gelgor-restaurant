#!/usr/bin/env bash
# E2E: propose → approve → poll → verify artifacts for workspace
set -euo pipefail

WS="${1:-5feb36f7-def7-4b4a-834f-353457de57bf}"
CREW="${CREW_BACKEND_URL:-http://localhost:8000}"
NEXUS="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:5050}"
KEY="${INTERNAL_API_KEY:-smartagency-internal-dev-key}"

echo "=== Mission → Feed E2E ==="
echo "workspace: $WS"

echo ""
echo "1) Propose (30–120s)..."
PROP=$(curl -sf -m 130 -X POST "$CREW/api/v1/missions/$WS/propose" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $WS" \
  -d '{"context_signals":"E2E feed regression test"}') || { echo "PROPOSE failed"; exit 1; }

MISSION_ID=$(echo "$PROP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ms=d.get('missions') or d.get('created') or []
if isinstance(ms,list) and ms: print(ms[0]['id'])
elif d.get('id'): print(d['id'])
else: sys.exit(1)
")
TITLE=$(echo "$PROP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ms=d.get('missions') or d.get('created') or []
if isinstance(ms,list) and ms: print(ms[0].get('title','')[:60])
")
echo "   mission: $TITLE ($MISSION_ID)"

echo ""
echo "2) Approve..."
curl -sf -m 30 -X PUT "$CREW/api/v1/missions/$WS/$MISSION_ID/approve" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $WS" \
  -d '{"approved_by":"e2e-script"}' | python3 -m json.tool | head -15

echo ""
echo "3) Poll progress (max 12 min)..."
DEADLINE=$(( $(date +%s) + 720 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  PROG=$(curl -sf -m 20 "$CREW/api/v1/missions/$WS/$MISSION_ID/progress" -H "X-Tenant-Id: $WS" || echo '{}')
  echo "$PROG" | python3 -c "
import json,sys
from datetime import datetime
d=json.load(sys.stdin)
st=d.get('status','?')
pct=d.get('completion_pct',0)
nodes=d.get('nodes') or []
done=sum(1 for n in nodes if n.get('status')=='completed')
run=sum(1 for n in nodes if n.get('status')=='running')
print(f\"   [{datetime.now().strftime('%H:%M:%S')}] {st} {pct}% ({done}/{len(nodes)} done, {run} running)\")
if st in ('completed',) or (pct or 0)>=100: sys.exit(0)
if st in ('failed','cancelled','rejected'): sys.exit(2)
sys.exit(1)
" && break
  COUNT=$(curl -sf -H "X-Tenant-Id: $WS" -H "X-Internal-Api-Key: $KEY" "$NEXUS/api/artifacts" | python3 -c "
import json,sys
mid='$MISSION_ID'
arts=json.load(sys.stdin)
n=0
for a in arts:
  m=a.get('metadata') or '{}'
  if isinstance(m,str):
    try: m=json.loads(m)
    except: m={}
  if str(m.get('mission_id',''))==mid: n+=1
print(n)
")
  echo "   mission artifacts in Nexus: $COUNT"
  sleep 20
done

echo ""
echo "4) Feed publishability check..."
cd "$(dirname "$0")/../apps/web"
npx tsx scripts/check-feed-publishable.mjs "$WS" "$MISSION_ID"

echo ""
echo "✓ E2E complete — mission $MISSION_ID"
echo "Feed: open app → Feed → mission chip or filter: $MISSION_ID"
