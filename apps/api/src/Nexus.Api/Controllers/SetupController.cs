using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Api.Services;
using Nexus.Infrastructure.Data;
using Nexus.Infrastructure.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SetupController : ControllerBase
{
    private static readonly IReadOnlyList<IndustryPlaybookDto> StarterIndustryPlaybooks = new[]
    {
        new IndustryPlaybookDto(
            "restaurant_cafe",
            "Restoran / Kafe",
            new[] { "menu_share", "campaign_offer", "event_announcement", "daily_story", "social_proof", "behind_the_scenes" },
            new[] { "price", "discount", "date", "location", "limited_availability" },
            new[] { "price", "discount", "date" },
            new[] { "instagram_story", "instagram_post", "instagram_reel", "google_business_update" }),
        new IndustryPlaybookDto(
            "beauty_wellness",
            "Güzellik / Wellness",
            new[] { "service_intro", "campaign_offer", "social_proof", "educational_post", "behind_the_scenes", "lead_generation" },
            new[] { "before_after", "personal_data", "discount", "health_claim" },
            new[] { "before_after", "personal_data", "health_claim" },
            new[] { "instagram_story", "instagram_reel", "instagram_post" }),
        new IndustryPlaybookDto(
            "healthcare_clinic",
            "Sağlık / Klinik",
            new[] { "educational_post", "service_intro", "social_proof", "lead_generation" },
            new[] { "regulated_industry", "health_claim", "before_after", "personal_data" },
            new[] { "health_claim", "before_after", "personal_data" },
            new[] { "instagram_carousel", "instagram_post", "google_business_update" }),
        new IndustryPlaybookDto(
            "real_estate",
            "Gayrimenkul",
            new[] { "product_highlight", "lead_generation", "educational_post", "social_proof", "campaign_offer" },
            new[] { "price", "location", "financial_claim", "limited_availability" },
            new[] { "price", "location", "financial_claim" },
            new[] { "instagram_post", "instagram_carousel", "meta_ad_creative" }),
        new IndustryPlaybookDto(
            "ecommerce_retail",
            "E-ticaret / Perakende",
            new[] { "product_highlight", "campaign_offer", "seasonal_content", "social_proof", "ad_creative" },
            new[] { "price", "discount", "limited_availability", "user_generated_content" },
            new[] { "price", "discount" },
            new[] { "instagram_post", "instagram_story", "meta_ad_creative" }),
        new IndustryPlaybookDto(
            "agency_services",
            "Ajans / Profesyonel Hizmet",
            new[] { "service_intro", "educational_post", "social_proof", "lead_generation" },
            new[] { "financial_claim", "legal_claim" },
            new[] { "financial_claim", "legal_claim" },
            new[] { "linkedin_post", "instagram_carousel", "meta_ad_creative" }),
        new IndustryPlaybookDto(
            "local_service_business",
            "Yerel Hizmet İşletmesi",
            new[] { "service_intro", "lead_generation", "social_proof", "educational_post", "google_business_update" },
            new[] { "price", "location", "personal_data" },
            new[] { "price", "personal_data" },
            new[] { "google_business_update", "instagram_post", "meta_ad_creative" }),
        new IndustryPlaybookDto(
            "barber_salon",
            "Berber / Kuaför",
            new[] { "service_intro", "social_proof", "post_service_client_result", "lead_generation", "behind_the_scenes" },
            new[] { "personal_data", "before_after", "price" },
            new[] { "personal_data", "before_after" },
            new[] { "instagram_story", "instagram_reel", "instagram_post" }),
    };

    private readonly ISetupService _setupService;
    private readonly ITenantOperatingPolicyService _operatingPolicyService;
    private readonly IBrandLearningService _brandLearningService;
    private readonly IVectorMemoryService _vectorMemoryService;
    private readonly NexusDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IRequestContext _requestContext;

    public SetupController(
        ISetupService setupService,
        ITenantOperatingPolicyService operatingPolicyService,
        IBrandLearningService brandLearningService,
        IVectorMemoryService vectorMemoryService,
        NexusDbContext db,
        IHttpClientFactory httpClientFactory,
        IRequestContext requestContext)
    {
        _setupService = setupService;
        _operatingPolicyService = operatingPolicyService;
        _brandLearningService = brandLearningService;
        _vectorMemoryService = vectorMemoryService;
        _db = db;
        _httpClientFactory = httpClientFactory;
        _requestContext = requestContext;
    }

    [HttpGet("profile")]
    public async Task<ActionResult<CompanyProfileDto>> GetProfile(CancellationToken cancellationToken)
    {
        var profile = await _setupService.GetCompanyProfileAsync(_requestContext.TenantId, cancellationToken);
        return Ok(profile);
    }

    [HttpGet("snapshot-core")]
    public async Task<ActionResult<BrandProfileCoreSnapshotDto>> GetBrandProfileSnapshotCore(
        CancellationToken cancellationToken)
    {
        var profile = await _setupService.GetCompanyProfileAsync(_requestContext.TenantId, cancellationToken);
        return Ok(new BrandProfileCoreSnapshotDto(
            _requestContext.TenantId,
            profile.BrandName,
            profile.Industry,
            profile.Location,
            profile.BrandTone,
            profile.TargetAudience,
            profile.VisualStyle,
            profile.CampaignGoals,
            SplitCsv(profile.Languages),
            profile.LogoUrl,
            profile.WebsiteUrl,
            profile.Description,
            profile.InstagramHandle,
            profile.GoogleBusinessUrl,
            SplitCsv(profile.BrandImageUrls),
            profile.PrimaryFont,
            profile.SecondaryFont,
            SplitCsv(profile.BrandColors),
            SplitCsv(profile.AccentColors),
            profile.CustomerVisibleSummary,
            profile.SystemIntelligence,
            profile.DiscoveryConfidence,
            profile.CreativeProfileConfirmedAt
        ));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<CompanyProfileDto>> SaveProfile([FromBody] SaveCompanyProfileRequest request, CancellationToken cancellationToken)
    {
        var profile = await _setupService.SaveCompanyProfileAsync(_requestContext.TenantId, request, cancellationToken);
        return Ok(profile);
    }

    private static IReadOnlyList<string> SplitCsv(string? value)
    {
        return (value ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToArray();
    }

    [HttpPost("complete")]
    public async Task<ActionResult<CompanyProfileDto>> CompleteSetup(CancellationToken cancellationToken)
    {
        var profile = await _setupService.CompleteSetupAsync(_requestContext.TenantId, cancellationToken);
        return Ok(profile);
    }

    [HttpGet("onboarding-status")]
    public async Task<IActionResult> GetOnboardingStatus(CancellationToken cancellationToken)
    {
        var profile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);

        var integrations = await _db.IntegrationConnections
            .AsNoTracking()
            .Where(i => i.TenantId == _requestContext.TenantId)
            .Select(i => new
            {
                provider = i.Provider.ToString(),
                status = i.Status.ToString(),
                i.DisplayName,
                i.AccountId
            })
            .ToListAsync(cancellationToken);

        var subscription = await _db.TenantSubscriptions
            .AsNoTracking()
            .Include(s => s.Package)
            .Where(s => s.TenantId == _requestContext.TenantId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new
            {
                s.Id,
                s.PackageId,
                packageName = s.Package != null ? s.Package.Name : string.Empty,
                status = s.Status.ToString()
            })
            .FirstOrDefaultAsync(cancellationToken);

        var hasProfile = profile != null &&
                         !string.IsNullOrWhiteSpace(profile.BrandName) &&
                         !string.IsNullOrWhiteSpace(profile.Industry) &&
                         !string.IsNullOrWhiteSpace(profile.TargetAudience);
        var hasBrandContext = profile != null &&
                              (!string.IsNullOrWhiteSpace(profile.BrandAnalysis) ||
                               !string.IsNullOrWhiteSpace(profile.CustomRules) ||
                               !string.IsNullOrWhiteSpace(profile.CampaignGoals));
        var hasContentNeeds = profile != null &&
                              !string.IsNullOrWhiteSpace(profile.ContentNeeds) &&
                              profile.ContentNeeds != "[]";
        var connectedIntegrations = integrations.Count(i => i.status == IntegrationStatus.Connected.ToString());
        var hasIntegrations = connectedIntegrations > 0;
        var hasPackage = subscription != null;
        var hasPermissions = profile != null && !string.IsNullOrWhiteSpace(profile.DefaultApprovalMode.ToString());
        var hasFirstAction = await _db.SuggestedActions
            .AsNoTracking()
            .AnyAsync(a => a.TenantId == _requestContext.TenantId, cancellationToken);
        var hasFirstTask = await _db.TaskItems
            .AsNoTracking()
            .AnyAsync(t => t.TenantId == _requestContext.TenantId, cancellationToken);

        var checks = new[]
        {
            new
            {
                id = "profile",
                label = "Marka profili",
                complete = hasProfile,
                detail = hasProfile ? "Marka adı, sektör ve hedef kitle hazır." : "Marka adı, sektör ve hedef kitleyi tamamlayın.",
                cta = "Şirket Bilgileri"
            },
            new
            {
                id = "brand_context",
                label = "Brand intelligence",
                complete = hasBrandContext,
                detail = hasBrandContext ? "AI promptları için marka hafızası güçlendi." : "Kampanya hedefleri, özel kurallar veya hesap analizi ekleyin.",
                cta = "Marka Analizi"
            },
            new
            {
                id = "content_needs",
                label = "İçerik ihtiyaçları",
                complete = hasContentNeeds,
                detail = hasContentNeeds ? "Tenant için sosyal medya içerik ihtiyaçları belirlendi." : "AI önerilerini doğrulayarak içerik ihtiyaçlarını seçin.",
                cta = "İçerik İhtiyaçları"
            },
            new
            {
                id = "integrations",
                label = "Provider bağlantıları",
                complete = hasIntegrations,
                detail = hasIntegrations ? $"{connectedIntegrations} provider bağlı." : "En az bir provider hesabı bağlayın.",
                cta = "Hesap Bağlantıları"
            },
            new
            {
                id = "package",
                label = "Paket seçimi",
                complete = hasPackage,
                detail = hasPackage ? $"{subscription?.packageName} paketi seçili." : "AI agent limitleri için paket seçin.",
                cta = "Paket Seçimi"
            },
            new
            {
                id = "permissions",
                label = "Onay modu",
                complete = hasPermissions,
                detail = profile != null ? $"Varsayılan mod: {profile.DefaultApprovalMode}" : "Canlı uygulama izinlerini belirleyin.",
                cta = "İzin Ayarları"
            },
            new
            {
                id = "first_run",
                label = "İlk AI önerisi",
                complete = hasFirstAction || hasFirstTask,
                detail = hasFirstAction ? "İlk AI action kuyruğu oluştu." : hasFirstTask ? "İlk AI görevi oluşturuldu." : "Dashboard’dan ilk agent görevini başlatın.",
                cta = "Dashboard"
            }
        };

        var completed = checks.Count(check => check.complete);
        var score = (int)Math.Round((double)completed / checks.Length * 100);

        return Ok(new
        {
            score,
            completed,
            total = checks.Length,
            readyForLaunch = hasProfile && hasContentNeeds && hasPackage && hasPermissions,
            readyForLiveActions = hasProfile && hasContentNeeds && hasIntegrations && hasPackage && hasPermissions,
            setupCompleted = profile?.SetupCompleted ?? false,
            profile = profile == null ? null : new
            {
                profile.BrandName,
                profile.Industry,
                profile.BrandTone,
                profile.SetupCompleted,
                profile.BrandAnalyzedAt,
                profile.ContentNeeds,
                profile.TemplateFamilies,
                profile.CreativeProfileConfirmedAt
            },
            integrations,
            subscription,
            checks,
            nextStep = checks.FirstOrDefault(check => !check.complete)
        });
    }

    [HttpGet("brand-style-score")]
    public async Task<ActionResult<object>> GetBrandStyleScore(CancellationToken cancellationToken)
    {
        var score = await _brandLearningService.CalculateBrandStyleScoreAsync(_requestContext.TenantId, cancellationToken);
        return Ok(new
        {
            tenantId = _requestContext.TenantId,
            score,
            label = score >= 80 ? "Strong" : score >= 60 ? "Improving" : "Needs Calibration"
        });
    }

    [HttpGet("industry-playbooks")]
    public ActionResult<IReadOnlyList<IndustryPlaybookDto>> GetIndustryPlaybooks()
    {
        return Ok(StarterIndustryPlaybooks);
    }

    [HttpGet("tenant-capabilities")]
    public ActionResult<IReadOnlyList<TenantCapabilityDefinitionDto>> GetTenantCapabilities(
        [FromQuery] string? industry = null)
    {
        return Ok(_operatingPolicyService.GetCapabilityCatalog(industry));
    }

    [HttpGet("operating-profile")]
    public async Task<ActionResult<TenantOperatingProfileDto>> GetOperatingProfile(CancellationToken cancellationToken)
    {
        var profile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);
        if (profile == null)
            return NotFound(new { error = "Company profile not found." });
        return Ok(_operatingPolicyService.ResolveProfile(profile));
    }

    [HttpPost("evaluate-capability")]
    public async Task<ActionResult<PolicyEvaluationResultDto>> EvaluateCapability(
        [FromBody] EvaluateCapabilityRequest request,
        CancellationToken cancellationToken)
    {
        var profile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);
        if (profile == null)
            return NotFound(new { error = "Company profile not found." });
        return Ok(_operatingPolicyService.EvaluateCapability(profile, request.CapabilityId));
    }

    [HttpPost("evaluate-gallery-asset")]
    public async Task<ActionResult<GalleryAssetPolicyResultDto>> EvaluateGalleryAsset(
        [FromBody] EvaluateGalleryAssetRequest request,
        CancellationToken cancellationToken)
    {
        var profile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);
        if (profile == null)
            return NotFound(new { error = "Company profile not found." });
        return Ok(_operatingPolicyService.EvaluateGalleryAsset(profile, request.AssetType));
    }

    [HttpPost("vector-memory/reindex")]
    public async Task<ActionResult<BrandMemoryReindexResult>> ReindexVectorMemory(CancellationToken cancellationToken)
    {
        var result = await _brandLearningService.ReindexBrandMemoryAsync(
            _requestContext.TenantId,
            cancellationToken);

        return Ok(result);
    }

    /// <summary>
    /// Runs Sprint 0 Brand Discovery from minimal public signals (website/social URLs),
    /// then optionally auto-fills CompanyProfile with inferred brand intelligence.
    /// </summary>
    [HttpPost("brand-discovery")]
    public async Task<ActionResult<BrandDiscoveryResultDto>> DiscoverBrand(
        [FromBody] BrandDiscoveryRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.WebsiteUrl) &&
            string.IsNullOrWhiteSpace(request.InstagramHandle) &&
            string.IsNullOrWhiteSpace(request.GoogleBusinessUrl) &&
            string.IsNullOrWhiteSpace(request.TikTokUrl) &&
            string.IsNullOrWhiteSpace(request.YouTubeUrl) &&
            string.IsNullOrWhiteSpace(request.LinkedInUrl))
        {
            return BadRequest(new { error = "En az bir web sitesi veya sosyal medya URL'i girin." });
        }

        var profile = await _db.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);

        if (profile == null)
        {
            profile = new CompanyProfile
            {
                TenantId = _requestContext.TenantId,
                CreatedBy = _requestContext.UserId,
                UpdatedBy = _requestContext.UserId
            };
            _db.CompanyProfiles.Add(profile);
        }

        try
        {
            var client = _httpClientFactory.CreateClient("CrewService");
            var payload = new
            {
                website_url = request.WebsiteUrl ?? string.Empty,
                instagram_handle = NormalizeInstagramHandle(request.InstagramHandle),
                google_business_url = request.GoogleBusinessUrl ?? string.Empty,
                brand_name = profile.BrandName,
                industry = profile.Industry,
            };

            var resp = await client.PostAsJsonAsync("/internal/v1/orchestration/analyze-brand", payload, cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                var errBody = await resp.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode(502, new { error = $"Brand discovery error: {errBody}" });
            }

            var result = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);
            var reportElement = result.TryGetProperty("report", out var reportJson) && reportJson.ValueKind == JsonValueKind.Object
                ? reportJson
                : default;

            var analysisText = GetString(result, "analysis_text");
            var inferredTone = GetString(result, "inferred_tone");
            var inferredLanguage = GetString(result, "inferred_language");
            var topHashtags = GetStringArray(result, "top_hashtags");
            var report = MapBrandIntelligenceReport(reportElement, inferredTone, inferredLanguage, topHashtags);
            var fetchOk = GetBool(result, "fetch_ok");

            if (request.ApplyToProfile)
            {
                ApplyDiscoveryToProfile(profile, request, report, analysisText, inferredLanguage);
                SeedOperatingPolicyFromProfile(profile);
                profile.BrandAnalyzedAt = DateTime.UtcNow;
                profile.UpdatedBy = _requestContext.UserId;

                if (!string.IsNullOrWhiteSpace(analysisText))
                {
                    _db.BrandMemoryDocuments.Add(new BrandMemoryDocument
                    {
                        TenantId = _requestContext.TenantId,
                        DocumentType = "brand_profile:discovery_report",
                        Title = $"Brand Discovery • {FirstNonEmpty(profile.BrandName, report.BrandName, "Tenant")}",
                        Content =
                            $"Industry: {report.Industry}\n" +
                            $"Tone: {report.BrandTone}\n" +
                            $"Audience: {string.Join(", ", report.TargetAudience)}\n" +
                            $"ContentPillars: {string.Join(", ", report.ContentPillars)}\n" +
                            $"TemplateNeeds: {string.Join(", ", report.TemplateNeeds)}\n" +
                            $"MissingQuestions: {string.Join(" | ", report.MissingQuestions)}\n\n" +
                            analysisText,
                        CreatedBy = _requestContext.UserId,
                        UpdatedBy = _requestContext.UserId
                    });
                }

                await _db.SaveChangesAsync(cancellationToken);
            }

            var profileDto = await _setupService.GetCompanyProfileAsync(_requestContext.TenantId, cancellationToken);
            return Ok(new BrandDiscoveryResultDto(
                true,
                fetchOk
                    ? "Brand discovery completed and profile fields were updated where possible."
                    : "Brand discovery completed with limited public data. Review missing questions.",
                report,
                profileDto,
                analysisText,
                inferredLanguage,
                fetchOk,
                profile.BrandAnalyzedAt));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("vector-memory/status")]
    public async Task<ActionResult<VectorMemoryStatus>> GetVectorMemoryStatus(CancellationToken cancellationToken)
    {
        var result = await _vectorMemoryService.GetStatusAsync(cancellationToken);
        return Ok(result);
    }

    private static BrandIntelligenceReportDto MapBrandIntelligenceReport(
        JsonElement report,
        string inferredTone,
        string inferredLanguage,
        IReadOnlyList<string> topHashtags)
    {
        if (report.ValueKind != JsonValueKind.Object)
        {
            return new BrandIntelligenceReportDto(
                string.Empty,
                "general_business",
                Array.Empty<string>(),
                inferredTone,
                string.Empty,
                Array.Empty<string>(),
                Array.Empty<string>(),
                Array.Empty<string>(),
                Array.Empty<string>(),
                Array.Empty<string>(),
                new[] { "Marka bilgilerini tamamlamak için web sitesi veya sosyal profil verisi ekleyin." },
                string.Empty,
                topHashtags,
                "local_service_business",
                Array.Empty<string>(),
                new Dictionary<string, string>(),
                Array.Empty<string>());
        }

        return new BrandIntelligenceReportDto(
            GetString(report, "brand_name"),
            FirstNonEmpty(GetString(report, "industry"), "general_business"),
            GetStringArray(report, "target_audience"),
            FirstNonEmpty(GetString(report, "brand_tone"), inferredTone),
            GetString(report, "visual_style"),
            GetStringArray(report, "primary_goals"),
            GetStringArray(report, "content_pillars"),
            GetStringArray(report, "default_ctas"),
            GetStringArray(report, "template_needs"),
            GetStringArray(report, "asset_recommendations"),
            GetStringArray(report, "missing_questions"),
            GetString(report, "website_summary"),
            topHashtags,
            FirstNonEmpty(GetString(report, "playbook_id"), GetString(report, "industry"), "local_service_business"),
            GetStringArray(report, "preferred_channels"),
            GetStringDictionary(report, "risk_rules"),
            GetStringArray(report, "approval_required_for"));
    }

    private void SeedOperatingPolicyFromProfile(CompanyProfile profile)
    {
        var resolved = _operatingPolicyService.ResolveProfile(profile);
        profile.OperatingCapabilities = JsonSerializer.Serialize(resolved.EnabledCapabilities);
        profile.GalleryPolicy = JsonSerializer.Serialize(new
        {
            allowedAssetIntents = resolved.GalleryPolicy.AllowedAssetIntents,
            clientPhotoPolicy = resolved.GalleryPolicy.ClientPhotoPolicy,
            beforeAfterPolicy = resolved.GalleryPolicy.BeforeAfterPolicy,
            maxGalleryPhotos = resolved.GalleryPolicy.MaxGalleryPhotos,
            requireConsentMetadata = resolved.GalleryPolicy.RequireConsentMetadata,
        });
    }

    private static void ApplyDiscoveryToProfile(
        CompanyProfile profile,
        BrandDiscoveryRequest request,
        BrandIntelligenceReportDto report,
        string analysisText,
        string inferredLanguage)
    {
        if (!string.IsNullOrWhiteSpace(request.WebsiteUrl))
            profile.WebsiteUrl = request.WebsiteUrl.Trim();
        if (!string.IsNullOrWhiteSpace(request.InstagramHandle))
            profile.InstagramHandle = NormalizeInstagramHandle(request.InstagramHandle);
        if (!string.IsNullOrWhiteSpace(request.GoogleBusinessUrl))
            profile.GoogleBusinessUrl = request.GoogleBusinessUrl.Trim();

        profile.BrandName = FillIfEmpty(profile.BrandName, report.BrandName);
        profile.Industry = FillIfEmpty(profile.Industry, report.Industry);
        profile.TargetAudience = FillIfEmpty(profile.TargetAudience, string.Join(", ", report.TargetAudience));
        profile.BrandTone = FillIfEmpty(profile.BrandTone, report.BrandTone);
        profile.VisualStyle = FillIfEmpty(profile.VisualStyle, report.VisualStyle);
        profile.Description = FillIfEmpty(profile.Description, report.WebsiteSummary);
        profile.Languages = FillIfEmpty(profile.Languages, inferredLanguage);

        var goals = string.Join(", ", report.PrimaryGoals.Concat(report.DefaultCtas).Where(value => !string.IsNullOrWhiteSpace(value)));
        profile.CampaignGoals = FillIfEmpty(profile.CampaignGoals, goals);

        var templateRules =
            $"Content pillars: {string.Join(", ", report.ContentPillars)}\n" +
            $"Template needs: {string.Join(", ", report.TemplateNeeds)}\n" +
            $"Asset recommendations: {string.Join(", ", report.AssetRecommendations)}";
        profile.SocialTemplateStyle = FillIfEmpty(profile.SocialTemplateStyle, templateRules);

        var missingQuestions = report.MissingQuestions.Count > 0
            ? "\n\nMinimum setup questions:\n- " + string.Join("\n- ", report.MissingQuestions)
            : string.Empty;
        profile.BrandAnalysis = string.IsNullOrWhiteSpace(analysisText)
            ? $"Brand Intelligence Report\n{templateRules}{missingQuestions}"
            : $"{analysisText}\n\n{templateRules}{missingQuestions}";
        profile.PlatformProfiles = JsonSerializer.Serialize(InferPlatforms(request));
        profile.ContentNeeds = JsonSerializer.Serialize(report.ContentPillars);
        profile.TemplateFamilies = JsonSerializer.Serialize(report.TemplateNeeds);
        profile.RiskRules = JsonSerializer.Serialize(report.RiskRules.Count > 0
            ? report.RiskRules
            : InferRiskRules(report.Industry, report.TemplateNeeds, report.ContentPillars));
        profile.CustomerVisibleSummary = BuildCustomerVisibleSummary(profile, report);
        profile.SystemIntelligence = BuildSystemIntelligence(report, analysisText);
        profile.DiscoveryConfidence = CalculateDiscoveryConfidence(request, report, analysisText);
        CompanyProfileFieldTrimmer.Apply(profile);
    }

    private static IReadOnlyList<string> InferPlatforms(BrandDiscoveryRequest request)
    {
        var platforms = new List<string>();
        if (!string.IsNullOrWhiteSpace(request.InstagramHandle)) platforms.Add("instagram");
        if (!string.IsNullOrWhiteSpace(request.GoogleBusinessUrl)) platforms.Add("google_business");
        if (!string.IsNullOrWhiteSpace(request.TikTokUrl)) platforms.Add("tiktok");
        if (!string.IsNullOrWhiteSpace(request.YouTubeUrl)) platforms.Add("youtube");
        if (!string.IsNullOrWhiteSpace(request.LinkedInUrl)) platforms.Add("linkedin");
        return platforms.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static Dictionary<string, string> InferRiskRules(
        string industry,
        IReadOnlyList<string> templateNeeds,
        IReadOnlyList<string> contentPillars)
    {
        var playbookId = NormalizeIndustryForRisk(industry);
        var rules = IndustryRiskPlaybooks.BuildDefaultRiskRules(playbookId);
        IndustryRiskPlaybooks.ApplyContentHeuristics(rules, industry, templateNeeds, contentPillars);
        return rules;
    }

    private static string NormalizeIndustryForRisk(string industry)
    {
        var value = (industry ?? "").Trim().ToLowerInvariant().Replace(' ', '_').Replace('/', '_').Replace('&', '_');
        if (value.Contains('_', StringComparison.Ordinal) && value.Length > 3)
            return value;
        return value switch
        {
            "restaurant" or "cafe" or "bistro" => "restaurant_cafe",
            "coffee" or "kahve" => "coffee_shop",
            "wedding" or "event" or "organizasyon" or "dugun" or "düğün" => "wedding_event",
            "beach" or "bar" => "beach_club",
            "gym" or "fitness" => "fitness_gym",
            "hotel" or "resort" or "otel" => "hospitality",
            "clinic" or "health" or "medical" => "healthcare_clinic",
            "retail" or "ecommerce" => "ecommerce_retail",
            _ => "local_service_business",
        };
    }

    private static string BuildCustomerVisibleSummary(CompanyProfile profile, BrandIntelligenceReportDto report)
    {
        var brandName = FirstNonEmpty(profile.BrandName, report.BrandName, "İşletmeniz");
        var industry = FirstNonEmpty(report.Industry, profile.Industry, "general_business");
        var goals = report.PrimaryGoals.Count > 0 ? string.Join(", ", report.PrimaryGoals.Take(3)) : "bilinirlik";
        var needs = report.ContentPillars.Count > 0 ? string.Join(", ", report.ContentPillars.Take(5)) : "daily_story";

        return $"{brandName} için sektör {industry} olarak analiz edildi. Öncelikli hedefler: {goals}. Önerilen sosyal medya ihtiyaçları: {needs}.";
    }

    private static string BuildSystemIntelligence(BrandIntelligenceReportDto report, string analysisText)
    {
        return
            $"Industry: {report.Industry}\n" +
            $"BrandTone: {report.BrandTone}\n" +
            $"VisualStyle: {report.VisualStyle}\n" +
            $"TargetAudience: {string.Join(", ", report.TargetAudience)}\n" +
            $"PrimaryGoals: {string.Join(", ", report.PrimaryGoals)}\n" +
            $"ContentNeeds: {string.Join(", ", report.ContentPillars)}\n" +
            $"TemplateFamilies: {string.Join(", ", report.TemplateNeeds)}\n" +
            $"PlaybookId: {report.PlaybookId}\n" +
            $"PreferredChannels: {string.Join(", ", report.PreferredChannels)}\n" +
            $"RiskRules: {JsonSerializer.Serialize(report.RiskRules)}\n" +
            $"AssetRecommendations: {string.Join(", ", report.AssetRecommendations)}\n" +
            $"DefaultCtas: {string.Join(", ", report.DefaultCtas)}\n" +
            $"TopHashtags: {string.Join(", ", report.TopHashtags)}\n\n" +
            analysisText;
    }

    private static int CalculateDiscoveryConfidence(
        BrandDiscoveryRequest request,
        BrandIntelligenceReportDto report,
        string analysisText)
    {
        var score = 20;
        if (!string.IsNullOrWhiteSpace(request.WebsiteUrl)) score += 15;
        if (!string.IsNullOrWhiteSpace(request.InstagramHandle)) score += 15;
        if (!string.IsNullOrWhiteSpace(request.GoogleBusinessUrl)) score += 10;
        if (!string.IsNullOrWhiteSpace(analysisText)) score += 15;
        if (report.ContentPillars.Count > 0) score += 10;
        if (report.TemplateNeeds.Count > 0) score += 10;
        if (report.MissingQuestions.Count == 0) score += 5;
        return Math.Clamp(score, 0, 100);
    }

    private static string FillIfEmpty(string target, string? value)
    {
        if (string.IsNullOrWhiteSpace(target) && !string.IsNullOrWhiteSpace(value))
            return value.Trim();

        return target;
    }

    private static string NormalizeInstagramHandle(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var uri = new Uri(trimmed);
                return uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
            }
            catch
            {
                // Fall through to plain cleanup.
            }
        }

        return trimmed.TrimStart('@').TrimEnd('/');
    }

    private static string GetString(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind == JsonValueKind.Null)
            return string.Empty;

        return property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : property.ToString();
    }

    private static bool GetBool(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object &&
               element.TryGetProperty(propertyName, out var property) &&
               property.ValueKind == JsonValueKind.True;
    }

    private static IReadOnlyList<string> GetStringArray(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();

        return property.EnumerateArray()
            .Select(item =>
            {
                if (item.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                    return string.Empty;
                return item.ValueKind == JsonValueKind.String ? item.GetString() ?? string.Empty : item.ToString();
            })
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToArray();
    }

    private static IReadOnlyDictionary<string, string> GetStringDictionary(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Object)
            return new Dictionary<string, string>();

        return property.EnumerateObject()
            .Where(item => item.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
            .ToDictionary(
                item => item.Name,
                item => item.Value.ValueKind == JsonValueKind.String ? item.Value.GetString() ?? string.Empty : item.Value.ToString(),
                StringComparer.OrdinalIgnoreCase);
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;
    }

    /// <summary>
    /// Analyzes the brand's connected social accounts (Instagram, Google Business)
    /// and stores the result in CompanyProfile.BrandAnalysis for agent prompt injection.
    /// </summary>
    [HttpPost("analyze-brand")]
    public async Task<IActionResult> AnalyzeBrand(CancellationToken cancellationToken)
    {
        var profile = await _db.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);

        if (profile == null)
            return BadRequest(new { error = "Company profile not found. Complete setup first." });

        if (string.IsNullOrWhiteSpace(profile.WebsiteUrl) &&
            string.IsNullOrWhiteSpace(profile.InstagramHandle) &&
            string.IsNullOrWhiteSpace(profile.GoogleBusinessUrl))
            return BadRequest(new
            {
                error = "En az biri dolu olmalı: Web sitesi, Instagram kullanıcı adı veya Google Business URL.",
            });

        // Call Python brand analyzer
        try
        {
            var client = _httpClientFactory.CreateClient("CrewService");
            var payload = new
            {
                website_url = profile.WebsiteUrl ?? string.Empty,
                instagram_handle = profile.InstagramHandle ?? string.Empty,
                google_business_url = profile.GoogleBusinessUrl ?? string.Empty,
                brand_name = profile.BrandName,
                industry = profile.Industry,
            };

            var resp = await client.PostAsJsonAsync("/internal/v1/orchestration/analyze-brand", payload, cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                var errBody = await resp.Content.ReadAsStringAsync(cancellationToken);
                return StatusCode(502, new { error = $"Brand analyzer error: {errBody}" });
            }

            var json = await resp.Content.ReadAsStringAsync(cancellationToken);
            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(json);
                root = doc.RootElement.Clone();
            }
            catch (JsonException ex)
            {
                return StatusCode(502, new { error = "Brand analyzer JSON could not be parsed.", detail = ex.Message });
            }

            if (GetOptionalBool(root, "success") == false)
            {
                return StatusCode(502, new
                {
                    error = "Brand analyzer reported failure.",
                    detail = GetString(root, "error"),
                });
            }

            var analysisText = GetString(root, "analysis_text");
            var inferredTone = GetString(root, "inferred_tone");
            var inferredLang = GetString(root, "inferred_language");
            var hashtagList = GetStringArray(root, "top_hashtags");
            var topHashtags = string.Join(", ",
                hashtagList
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(15));
            var instagramBio = GetString(root, "instagram_bio");
            var instagramFollowers = GetNullableInt64(root, "instagram_followers");

            // Persist to CompanyProfile
            profile.BrandAnalysis = analysisText ?? string.Empty;
            profile.BrandAnalyzedAt = DateTime.UtcNow;

            // Auto-update inferred fields if they were empty
            if (string.IsNullOrWhiteSpace(profile.BrandTone) && !string.IsNullOrWhiteSpace(inferredTone))
                profile.BrandTone = inferredTone;
            if (string.IsNullOrWhiteSpace(profile.Languages) && !string.IsNullOrWhiteSpace(inferredLang))
                profile.Languages = inferredLang;

            profile.UpdatedBy = _requestContext.UserId;
            CompanyProfileFieldTrimmer.Apply(profile);
            if (!string.IsNullOrWhiteSpace(profile.BrandAnalysis))
            {
                var memoryContent = CompanyProfileFieldTrimmer.TruncateForStorage(
                    $"InferredTone: {inferredTone}\n" +
                    $"InferredLanguage: {inferredLang}\n" +
                    $"TopHashtags: {topHashtags}\n" +
                    $"Analysis:\n{profile.BrandAnalysis}",
                    24000);
                _db.BrandMemoryDocuments.Add(new BrandMemoryDocument
                {
                    TenantId = _requestContext.TenantId,
                    DocumentType = "brand_profile:account_analysis",
                    Title = CompanyProfileFieldTrimmer.TruncateForStorage($"Brand Analysis • {profile.BrandName}", 500),
                    Content = memoryContent,
                    CreatedBy = _requestContext.UserId,
                    UpdatedBy = _requestContext.UserId
                });
            }
            await _db.SaveChangesAsync(cancellationToken);

            return Ok(new
            {
                success = true,
                analysisText = profile.BrandAnalysis,
                inferredTone,
                inferredLang,
                topHashtags,
                analyzedAt = profile.BrandAnalyzedAt,
                instagramBio,
                instagramFollowers,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    private static bool? GetOptionalBool(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(propertyName, out var property))
            return null;

        return property.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => null,
        };
    }

    /// <summary>
    /// Follower counts and other numeric fields from Python may be null, a JSON number, or occasionally a numeric string.
    /// Avoids <see cref="JsonElement"/> GetInt32 on null (throws) and mismatched DTO deserialization.
    /// </summary>
    private static long? GetNullableInt64(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind == JsonValueKind.Null)
            return null;

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt64(out var n))
            return n;

        if (property.ValueKind == JsonValueKind.String)
        {
            var s = property.GetString();
            if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
        }

        return null;
    }
}
