import { NextRequest, NextResponse } from 'next/server';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import type { BrandDiscoveryResult, BrandIntelligenceReport } from '@/types';
import { serverConfig } from '@/lib/server-config';
import {
  buildPreviewCacheKey,
  storeOnboardingPreviewDiscovery,
} from '@/lib/onboarding-preview-cache';

export const runtime = 'nodejs';
export const maxDuration = 180;

const CREW = getCrewBackendBaseUrl();
const INTERNAL_KEY = serverConfig.internal.apiKey;

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function mapReport(report: Record<string, unknown>, inferredTone: string, topHashtags: string[]): BrandIntelligenceReport {
  return {
    brandName: str(report.brand_name),
    industry: str(report.industry) || 'general_business',
    targetAudience: strArray(report.target_audience),
    brandTone: str(report.brand_tone) || inferredTone || 'professional',
    visualStyle: str(report.visual_style),
    primaryGoals: strArray(report.primary_goals),
    contentPillars: strArray(report.content_pillars),
    defaultCtas: strArray(report.default_ctas),
    templateNeeds: strArray(report.template_needs),
    assetRecommendations: strArray(report.asset_recommendations),
    missingQuestions: strArray(report.missing_questions),
    websiteSummary: str(report.website_summary),
    topHashtags,
    playbookId: str(report.playbook_id) || str(report.industry) || 'general_business',
    preferredChannels: strArray(report.preferred_channels),
    riskRules: (report.risk_rules && typeof report.risk_rules === 'object')
      ? Object.fromEntries(
          Object.entries(report.risk_rules as Record<string, unknown>)
            .map(([k, val]) => [k, String(val)]),
        )
      : {},
    approvalRequiredFor: strArray(report.approval_required_for),
  };
}

/** Pre-signup brand preview — calls Python analyze (no tenant persist). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const websiteUrl = str(body.websiteUrl ?? body.website_url);
  const instagramHandle = str(body.instagramHandle ?? body.instagram_handle).replace(/^@/, '');
  const googleBusinessUrl = str(body.googleBusinessUrl ?? body.google_business_url);
  const menuUrl = str(body.menuUrl ?? body.menu_url);

  if (!websiteUrl && !instagramHandle && !googleBusinessUrl && !menuUrl) {
    return NextResponse.json(
      { success: false, message: 'En az bir web sitesi, menü linki veya Instagram hesabı girin.' },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${CREW}/internal/v1/orchestration/analyze-brand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify({
        website_url: websiteUrl,
        instagram_handle: instagramHandle,
        google_business_url: googleBusinessUrl,
        menu_url: menuUrl,
      }),
      signal: AbortSignal.timeout(170_000),
    });

    const data = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok) {
      return NextResponse.json(
        {
          success: false,
          message: str(data.error) || 'Marka analizi başarısız.',
        },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      );
    }

    const reportRaw = (data.report && typeof data.report === 'object')
      ? (data.report as Record<string, unknown>)
      : {};
    const inferredTone = str(data.inferred_tone) || 'professional';
    const topHashtags = strArray(data.top_hashtags);
    const report = mapReport(reportRaw, inferredTone, topHashtags);
    const fetchOk = Boolean(data.fetch_ok);

    // Cache full discovery for post-signup persist (skip second Apify scrape).
    let previewCacheKey: string | undefined;
    const discovery = (data.discovery && typeof data.discovery === 'object')
      ? (data.discovery as Record<string, unknown>)
      : null;
    if (discovery) {
      previewCacheKey = buildPreviewCacheKey({
        websiteUrl,
        instagramHandle,
        googleBusinessUrl,
        menuUrl,
      });
      await storeOnboardingPreviewDiscovery(previewCacheKey, discovery).catch((err) => {
        console.warn('[preview-brand] cache store failed:', err);
        previewCacheKey = undefined;
      });
    }

    const websiteOk = Boolean((discovery?.website as Record<string, unknown> | undefined)?.raw_fetch_ok);
    const igOk = Boolean((discovery?.instagram as Record<string, unknown> | undefined)?.raw_fetch_ok);
    const googleOk = Boolean((discovery?.google_business as Record<string, unknown> | undefined)?.raw_fetch_ok);
    const sourcesOk = Number(websiteOk) + Number(igOk) + Number(googleOk);
    // Honest score: same formula as Python persist (30 + 20×sources), never inflate to 82.
    const confidence = fetchOk ? Math.min(90, 30 + sourcesOk * 20) : Math.max(15, 10 + sourcesOk * 10);
    const limited = !fetchOk || sourcesOk <= 1;
    const inferredLocation = str(discovery?.inferred_location);

    const result: BrandDiscoveryResult & { previewCacheKey?: string; confidence?: number } = {
      success: Boolean(data.success) && fetchOk,
      message: limited
        ? 'Sınırlı veri ile önizleme — web sitesi veya Google Business eklemek kaliteyi yükseltir.'
        : 'Marka analizi tamamlandı.',
      report,
      profile: {
        id: '',
        brandName: report.brandName || str(data.website_title),
        industry: report.industry,
        location: inferredLocation,
        brandTone: report.brandTone,
        targetAudience: report.targetAudience.join(', '),
        visualStyle: report.visualStyle,
        campaignGoals: report.primaryGoals.join(', '),
        competitors: '',
        customRules: '',
        languages: str(data.inferred_language) || 'tr',
        logoUrl: '',
        websiteUrl,
        description: report.websiteSummary,
        primaryFont: '',
        secondaryFont: '',
        brandColors: '',
        accentColors: '',
        socialTemplateStyle: '',
        defaultApprovalMode: 'SuggestAndWait',
        setupCompleted: false,
        instagramHandle: instagramHandle || undefined,
        googleBusinessUrl: googleBusinessUrl || undefined,
        platformProfiles: '[]',
        contentNeeds: JSON.stringify(report.contentPillars),
        operatingCapabilities: '[]',
        galleryPolicy: '{}',
        templateFamilies: '[]',
        riskRules: JSON.stringify(report.riskRules),
        customerVisibleSummary: report.websiteSummary,
        systemIntelligence: '',
        discoveryConfidence: confidence,
      },
      analysisText: str(data.analysis_text),
      inferredLanguage: str(data.inferred_language) || 'tr',
      fetchOk,
      confidence,
      analyzedAt: new Date().toISOString(),
      ...(previewCacheKey ? { previewCacheKey } : {}),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        message: `Marka analiz servisine ulaşılamadı: ${message}`,
        hint: 'Python crew servisinin çalıştığından emin olun (./scripts/start-crew-backend.sh)',
      },
      { status: 503 },
    );
  }
}
