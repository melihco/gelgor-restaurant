using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record CompanyProfileDto(
    Guid Id,
    string BrandName,
    string Industry,
    string Location,
    string BrandTone,
    string TargetAudience,
    string VisualStyle,
    string CampaignGoals,
    string Competitors,
    string CustomRules,
    string Languages,
    string LogoUrl,
    string WebsiteUrl,
    string Description,
    string PrimaryFont,
    string SecondaryFont,
    string BrandColors,
    string AccentColors,
    string SocialTemplateStyle,
    string LogoUsageRules,
    ApprovalMode DefaultApprovalMode,
    bool SetupCompleted,
    DateTime? SetupCompletedAt,
    string InstagramHandle,
    string GoogleBusinessUrl,
    string BrandImageUrls,
    string BrandAnalysis,
    DateTime? BrandAnalyzedAt,
    string PlatformProfiles,
    string ContentNeeds,
    string OperatingCapabilities,
    string GalleryPolicy,
    string TemplateFamilies,
    string RiskRules,
    string CustomerVisibleSummary,
    string SystemIntelligence,
    int? DiscoveryConfidence,
    DateTime? CreativeProfileConfirmedAt);

public record SaveCompanyProfileRequest(
    string BrandName,
    string Industry,
    string Location,
    string BrandTone,
    string TargetAudience,
    string VisualStyle,
    string CampaignGoals,
    string Competitors,
    string CustomRules,
    string Languages,
    string LogoUrl,
    string WebsiteUrl,
    string Description,
    ApprovalMode DefaultApprovalMode,
    string InstagramHandle = "",
    string GoogleBusinessUrl = "",
    string BrandImageUrls = "",
    string PrimaryFont = "",
    string SecondaryFont = "",
    string BrandColors = "",
    string AccentColors = "",
    string SocialTemplateStyle = "",
    string LogoUsageRules = "",
    string PlatformProfiles = "[]",
    string ContentNeeds = "[]",
    string OperatingCapabilities = "[]",
    string GalleryPolicy = "{}",
    string TemplateFamilies = "[]",
    string RiskRules = "{}",
    string CustomerVisibleSummary = "",
    string SystemIntelligence = "",
    int? DiscoveryConfidence = null,
    DateTime? CreativeProfileConfirmedAt = null);

public record CompleteSetupRequest(bool Confirm);

public record BrandDiscoveryRequest(
    string WebsiteUrl = "",
    string InstagramHandle = "",
    string GoogleBusinessUrl = "",
    string TikTokUrl = "",
    string YouTubeUrl = "",
    string LinkedInUrl = "",
    string PrimaryGoal = "",
    bool ApplyToProfile = true);

public record BrandIntelligenceReportDto(
    string BrandName,
    string Industry,
    IReadOnlyList<string> TargetAudience,
    string BrandTone,
    string VisualStyle,
    IReadOnlyList<string> PrimaryGoals,
    IReadOnlyList<string> ContentPillars,
    IReadOnlyList<string> DefaultCtas,
    IReadOnlyList<string> TemplateNeeds,
    IReadOnlyList<string> AssetRecommendations,
    IReadOnlyList<string> MissingQuestions,
    string WebsiteSummary,
    IReadOnlyList<string> TopHashtags,
    string PlaybookId,
    IReadOnlyList<string> PreferredChannels,
    IReadOnlyDictionary<string, string> RiskRules,
    IReadOnlyList<string> ApprovalRequiredFor);

public record BrandDiscoveryResultDto(
    bool Success,
    string Message,
    BrandIntelligenceReportDto Report,
    CompanyProfileDto Profile,
    string AnalysisText,
    string InferredLanguage,
    bool FetchOk,
    DateTime? AnalyzedAt);

public record CreativeContentNeedDto(
    string Id,
    string Label,
    string Description,
    IReadOnlyList<string> DefaultChannels,
    string DefaultRiskTier,
    IReadOnlyList<string> RequiredAssetIntents);

public record IndustryPlaybookDto(
    string Id,
    string Label,
    IReadOnlyList<string> DefaultContentNeeds,
    IReadOnlyList<string> RiskySignals,
    IReadOnlyList<string> ApprovalRequiredFor,
    IReadOnlyList<string> PreferredChannels);

public record TemplateFamilyContractDto(
    string Id,
    string Label,
    IReadOnlyList<string> Intents,
    IReadOnlyList<string> Channels,
    IReadOnlyList<string> Industries,
    IReadOnlyList<string> RequiredFields,
    IReadOnlyList<string> OptionalFields,
    IReadOnlyList<string> RequiredAssetIntents,
    string RiskTier,
    string Status);

public record TenantCreativeProfileDto(
    Guid TenantId,
    Guid? OfficeId,
    string Industry,
    string BusinessType,
    IReadOnlyList<string> Platforms,
    IReadOnlyList<string> SelectedContentNeeds,
    IReadOnlyList<string> OperatingCapabilities,
    TenantGalleryPolicyDto? GalleryPolicy,
    IReadOnlyList<string> SelectedTemplateFamilies,
    IReadOnlyList<string> BrandTone,
    IReadOnlyList<string> Keywords,
    IReadOnlyList<string> DefaultCtas,
    IReadOnlyDictionary<string, string> RiskRules,
    string CustomerVisibleSummary,
    string SystemIntelligence,
    int? DiscoveryConfidence,
    DateTime? ConfirmedAt);

public record CreativeIntentBriefDto(
    Guid TenantId,
    Guid? OfficeId,
    string Intent,
    string Channel,
    string Headline,
    string Subtitle,
    string Caption,
    string Cta,
    string AssetIntent,
    IReadOnlyList<string> RiskSignals,
    string Industry,
    string Locale,
    string Source);

public record TemplateDecisionResultDto(
    string TemplateId,
    string TemplateFamilyId,
    string SelectedBy,
    int Score,
    string Eligibility,
    string RiskTier,
    bool ApprovalRequired,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<string> MissingFields,
    IReadOnlyList<string> ValidationWarnings);
