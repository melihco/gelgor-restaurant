import { NextRequest, NextResponse } from 'next/server';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import type { BrandDiscoveryResult, BrandIntelligenceReport } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

const CREW = getCrewBackendBaseUrl();
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

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

  if (!websiteUrl && !instagramHandle && !googleBusinessUrl) {
    return NextResponse.json(
      { success: false, message: 'En az bir web sitesi veya Instagram hesabı girin.' },
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

    const result: BrandDiscoveryResult = {
      success: Boolean(data.success ?? fetchOk),
      message: fetchOk
        ? 'Marka analizi tamamlandı.'
        : 'Sınırlı veri ile önizleme oluşturuldu.',
      report,
      profile: {
        id: '',
        brandName: report.brandName || str(data.website_title),
        industry: report.industry,
        location: '',
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
        logoUsageRules: '',
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
        discoveryConfidence: fetchOk ? 70 : 35,
      },
      analysisText: str(data.analysis_text),
      inferredLanguage: str(data.inferred_language) || 'tr',
      fetchOk,
      analyzedAt: new Date().toISOString(),
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
