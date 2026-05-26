using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class CompanyProfile : TenantEntity
{
    public string BrandName { get; set; } = string.Empty;
    public string Industry { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string BrandTone { get; set; } = "professional";
    public string TargetAudience { get; set; } = string.Empty;
    public string VisualStyle { get; set; } = string.Empty;
    public string CampaignGoals { get; set; } = string.Empty;
    public string Competitors { get; set; } = string.Empty;
    public string CustomRules { get; set; } = string.Empty;
    public string Languages { get; set; } = "tr";
    public string LogoUrl { get; set; } = string.Empty;
    public string WebsiteUrl { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    /// <summary>Primary brand font for generated social creatives.</summary>
    public string PrimaryFont { get; set; } = string.Empty;

    /// <summary>Secondary/accent brand font for generated social creatives.</summary>
    public string SecondaryFont { get; set; } = string.Empty;

    /// <summary>Comma-separated brand colors, preferably hex values.</summary>
    public string BrandColors { get; set; } = string.Empty;

    /// <summary>Comma-separated accent colors, preferably hex values.</summary>
    public string AccentColors { get; set; } = string.Empty;

    /// <summary>Default social template style rules for Canva and image generation.</summary>
    public string SocialTemplateStyle { get; set; } = string.Empty;

    /// <summary>Do/don't rules for logo placement in generated creatives.</summary>
    public string LogoUsageRules { get; set; } = string.Empty;

    /// <summary>Instagram handle without @, e.g. "cafebosphorus"</summary>
    public string InstagramHandle { get; set; } = string.Empty;

    /// <summary>Google Business Profile URL or Place ID</summary>
    public string GoogleBusinessUrl { get; set; } = string.Empty;

    /// <summary>Comma-separated public image URLs representing brand visuals</summary>
    public string BrandImageUrls { get; set; } = string.Empty;

    /// <summary>Auto-generated brand analysis from connected accounts. JSON string.</summary>
    public string BrandAnalysis { get; set; } = string.Empty;

    /// <summary>When brand analysis was last run</summary>
    public DateTime? BrandAnalyzedAt { get; set; }

    /// <summary>JSON array of connected/target social platforms selected during AI-assisted setup.</summary>
    public string PlatformProfiles { get; set; } = "[]";

    /// <summary>JSON array of confirmed content needs such as menu_share or event_announcement.</summary>
    public string ContentNeeds { get; set; } = "[]";

    /// <summary>JSON array of enabled template family identifiers for this tenant.</summary>
    public string TemplateFamilies { get; set; } = "[]";

    /// <summary>JSON object mapping creative risk signals to allow/approval_required/blocked decisions.</summary>
    public string RiskRules { get; set; } = "{}";

    /// <summary>Short AI-generated company summary shown to the customer during setup confirmation.</summary>
    public string CustomerVisibleSummary { get; set; } = string.Empty;

    /// <summary>Detailed AI-generated system intelligence used by prompts, template selection and policy logic.</summary>
    public string SystemIntelligence { get; set; } = string.Empty;

    public int? DiscoveryConfidence { get; set; }
    public DateTime? CreativeProfileConfirmedAt { get; set; }

    public ApprovalMode DefaultApprovalMode { get; set; } = ApprovalMode.SuggestAndWait;
    public bool SetupCompleted { get; set; }
    public DateTime? SetupCompletedAt { get; set; }
}
