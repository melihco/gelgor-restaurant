# Modül Modül İnceleme — Takip

**Yaklaşım:** Her modül → durum tespiti → en fazla **3–5 küçük adım** → uygula → kapat → sonraki modül.  
**Büyük refactor yok** — Content Router / Bundle tam programı sprint planında; burada **modül modül mikro iyileştirme**.

---

## Modül sırası (bağımlılık)

| # | Modül | Durum | Sonraki mikro adım |
|---|--------|--------|---------------------|
| **M00** | Brand Readiness & analiz kapısı | ⏳ Sıradaki | readiness API |
| **M01** | Mission Hub (otonom kapalı) | ⏳ | readiness gate |
| **M02** | Fikir parse sözleşmesi | 🔄 APO-3 | Hub `parseProductionIdeas` ✓; auto-produce ⏳ |
| **M03** | Auto-produce (server) | 🔄 APO-2/3 | Router+metadata ✓; story still+carousel fix ✓; PIS gate ⏳ |
| **M04** | Galeri zekâsı | ⏳ | — |
| **M05** | Otonom Feed | ⏳ | — |
| **M06** | ~~Canva~~ → Remotion export | 🚫 İptal | API OFF; poster/story = Remotion + announcement |
| **M07** | Duyuru / canvas / ajans | ⏳ | — |
| **M08** | Gelişmiş Fabrika (IdeaCard) | ⏳ | — |
| **M09** | Artifact & Bundle | ⏳ | — |
| **M10** | Feed & onay | ⏳ | — |
| **M11** | Publish | ⏳ | — |
| **M12** | Learning | ⏳ | — |

---

## Modül şablonu (her modül için doldur)

```markdown
### M0X — [Ad]

**Sorumluluk:** …
**Giriş / çıkış:** …
**Ana dosyalar:** …

#### Durum (✅ / ⚠️ / ❌)
- …

#### Sorunlar (max 3)
1. …

#### Mikro adımlar (max 5, her biri ≤1–2 gün)
- [ ] …

#### Bilinçli olarak ertelenen
- …
```

---

## Tamamlanan modüller

*(henüz yok)*

---

## İlgili dokümanlar

- `docs/foundation-sprint-program.md` — **10 sprint, BAS %100, şimdi Sprint 1 planı**
- `docs/foundation-first-roadmap.md` — katman mantığı, otonom son
- `docs/quality-priority-backlog.md` — vizyon + çıktı kalitesi öncelik listesi (Tier A–D)
- `docs/sprint-plan-creative-os.md` — uzun vadeli program  
- `docs/production-pipeline-evaluation-report.md` — teknik envanter  
- `docs/strategic-architecture-review.md` — strateji
