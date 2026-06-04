#!/usr/bin/env bash
# Pilot QA audit — hits Foundation BFF routes and prints checklist-oriented summary.
# Usage: ./scripts/pilot-qa-audit.sh [tenantId] [baseUrl]
set -euo pipefail

TENANT="${1:-431b2901-a2dc-4df6-abe3-3670d9844851}"
BASE="${2:-http://localhost:3000}"

pass() { printf '  ✅ %s\n' "$1"; }
fail() { printf '  ❌ %s\n' "$1"; }
warn() { printf '  ⚠️  %s\n' "$1"; }
info() { printf '  ·  %s\n' "$1"; }

fetch() {
  curl -sf "$1" 2>/dev/null || echo '{}'
}

echo "════════════════════════════════════════════════════════"
echo " Pilot QA Audit"
echo " Tenant: $TENANT"
echo " Base:   $BASE"
echo " Date:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "════════════════════════════════════════════════════════"

BRS=$(fetch "$BASE/api/brand-readiness/$TENANT")
GIS=$(fetch "$BASE/api/gallery-intelligence/$TENANT")
CCS=$(fetch "$BASE/api/context-signals/$TENANT")
BAS=$(fetch "$BASE/api/brand-alignment/$TENANT")
AUTO=$(curl -sf -X POST "$BASE/api/missions/$TENANT/auto-trigger" 2>/dev/null || echo '{}')

brs_score=$(echo "$BRS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).score ?? 0' <<< "$BRS" 2>/dev/null || echo 0)
gis_score=$(echo "$GIS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).score ?? 0' <<< "$GIS" 2>/dev/null || echo 0)
ccs_score=$(echo "$CCS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).coverageScore ?? 0' <<< "$CCS" 2>/dev/null || echo 0)
bas_score=$(echo "$BAS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).bas ?? 0' <<< "$BAS" 2>/dev/null || echo 0)
can_auto=$(echo "$BAS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).canAutoProduce === true' <<< "$BAS" 2>/dev/null || echo false)

echo ""
echo "── 1. Skor altyapısı ──"
[[ "$brs_score" -gt 0 ]] && pass "brand-readiness score=$brs_score" || fail "brand-readiness unreachable"
[[ "$gis_score" -gt 0 ]] && pass "gallery-intelligence score=$gis_score" || fail "gallery-intelligence unreachable"
[[ "$ccs_score" -gt 0 ]] && pass "context-signals coverageScore=$ccs_score" || fail "context-signals unreachable"
[[ "$bas_score" -gt 0 ]] && pass "brand-alignment bas=$bas_score" || fail "brand-alignment unreachable"

echo ""
echo "── 2–4. Standing sub-scores ──"
info "BRS=$brs_score  GIS=$gis_score  CCS=$ccs_score  BAS=$bas_score"
echo "$BRS" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
(j.checks||[]).forEach(c=>console.log((c.passed?'  ✅':'  ❌')+' BRS '+c.id+': '+c.detail));
" 2>/dev/null || true
echo "$GIS" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
(j.checks||[]).forEach(c=>console.log((c.passed?'  ✅':'  ❌')+' GIS '+c.id+': '+c.detail));
" 2>/dev/null || true

sector=$(echo "$CCS" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).sectorPack?.id ?? "?"' <<< "$CCS" 2>/dev/null || echo "?")
info "sectorPack=$sector"

echo ""
echo "── 5. Otonomi kapısı ──"
if [[ "$can_auto" == "true" ]]; then
  pass "canAutoProduce=true (BAS=100)"
else
  fail "canAutoProduce=false — otonom kapalı"
  echo "$AUTO" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
if(j.detail) console.log('  · '+j.detail);
if(j.bas!=null) console.log('  · bas='+j.bas);
" 2>/dev/null || true
fi

echo ""
echo "── Özet ──"
if [[ "$bas_score" -eq 100 && "$can_auto" == "true" ]]; then
  pass "BAS=100 → S10 otonom açılışa hazır"
  info "Set NEXT_PUBLIC_AUTO_MISSION_TRIGGER=true in apps/web/.env.local"
else
  warn "BAS=$bas_score — otonom açılış için standing skorların tamamı 100 olmalı"
  weakest=$(echo "$BAS" | node -pe 'const w=JSON.parse(require("fs").readFileSync(0,"utf8")).weakest; w?w.label+" ("+w.id+"="+w.score+")":""' <<< "$BAS" 2>/dev/null || echo "")
  [[ -n "$weakest" ]] && info "En zayıf: $weakest"
fi
echo "════════════════════════════════════════════════════════"
