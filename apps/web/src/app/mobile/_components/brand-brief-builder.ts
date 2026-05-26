import type { CompanyProfile } from '@/types';

function currentSeasonTR(): string {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'ilkbahar';
  if (m >= 5 && m <= 7) return 'yaz';
  if (m >= 8 && m <= 10) return 'sonbahar';
  return 'kış';
}

const CONTENT_TASKS = new Set([
  'content_ideation', 'content_calendar', 'content_strategy', 'visual_design_cards',
]);
const REVIEW_TASKS = new Set(['review_analysis', 'single_review_response']);
const ADS_TASKS    = new Set(['campaign_analysis', 'ad_creative_generation', 'auto_budget_optimize', 'ads_budget_optimization']);
const ANALYTICS_TASKS = new Set(['traffic_analysis', 'conversion_report', 'weekly_performance']);

/**
 * Builds a task-specific brief string enriched with brand intelligence.
 * Injected as `brief` in inputData so agents receive full brand context
 * beyond the base BrandInfo backstory already included by .NET.
 */
export function buildBrandAwareBrief(
  profile: CompanyProfile,
  taskType: string,
  customNote?: string,
): string {
  const d = new Date();
  const monthTR = d.toLocaleString('tr-TR', { month: 'long' });
  const lines: string[] = [];

  // ── Core brand identity ──
  if (profile.brandName)      lines.push(`Marka: ${profile.brandName}`);
  if (profile.location)       lines.push(`Konum: ${profile.location}`);
  if (profile.industry)       lines.push(`Sektör: ${profile.industry}`);
  if (profile.targetAudience) lines.push(`Hedef kitle: ${profile.targetAudience}`);
  if (profile.brandTone)      lines.push(`İletişim tonu: ${profile.brandTone}`);
  if (profile.visualStyle)    lines.push(`Görsel kimlik: ${profile.visualStyle}`);
  if (profile.languages)      lines.push(`Dil: ${profile.languages}`);

  // ── Seasonal context ──
  lines.push(`Dönem: ${currentSeasonTR()} ${d.getFullYear()}, ${monthTR}`);

  // ── Campaign objectives ──
  if (profile.campaignGoals) lines.push(`Kampanya hedefleri: ${profile.campaignGoals}`);

  // ── Task-specific enrichment ──
  if (CONTENT_TASKS.has(taskType)) {
    if (profile.contentNeeds) lines.push(`İçerik ihtiyaçları: ${profile.contentNeeds}`);
    if (profile.competitors)  lines.push(`Rakip bağlamı: ${profile.competitors}`);
    // systemIntelligence = trend/performance intelligence stored by admin
    if (profile.systemIntelligence) {
      lines.push(`Marka zekası:\n${profile.systemIntelligence.slice(0, 500)}`);
    }
    if (profile.templateFamilies) lines.push(`Şablon aileleri: ${profile.templateFamilies}`);
  }

  if (REVIEW_TASKS.has(taskType)) {
    if (profile.customRules)    lines.push(`Yanıt tonu kuralları: ${profile.customRules}`);
    if (profile.competitors)    lines.push(`Rekabet bağlamı: ${profile.competitors}`);
    if (profile.description)    lines.push(`İşletme açıklaması: ${profile.description}`);
  }

  if (ADS_TASKS.has(taskType)) {
    if (profile.competitors)   lines.push(`Rakipler: ${profile.competitors}`);
    if (profile.contentNeeds)  lines.push(`Kampanya bağlamı: ${profile.contentNeeds}`);
    if (profile.systemIntelligence) {
      lines.push(`Performans zekası:\n${profile.systemIntelligence.slice(0, 400)}`);
    }
  }

  if (ANALYTICS_TASKS.has(taskType)) {
    if (profile.campaignGoals) lines.push(`KPI hedefleri: ${profile.campaignGoals}`);
    if (profile.description)   lines.push(`İşletme bağlamı: ${profile.description}`);
  }

  // ── Risk rules (all tasks) ──
  if (profile.riskRules) lines.push(`Marka riski kuralları: ${profile.riskRules}`);

  // ── Operator's custom note (highest priority) ──
  if (customNote?.trim()) lines.push(`\nOperatör yönlendirmesi: ${customNote.trim()}`);

  return lines.filter(Boolean).join('\n');
}
