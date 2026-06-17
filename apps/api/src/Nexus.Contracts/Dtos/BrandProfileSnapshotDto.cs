namespace Nexus.Contracts.Dtos;

public record BrandProfileCoreSnapshotDto(
    Guid TenantId,
    string BrandName,
    string Industry,
    string Location,
    string BrandTone,
    string TargetAudience,
    string VisualStyle,
    string CampaignGoals,
    IReadOnlyList<string> Languages,
    string LogoUrl,
    string WebsiteUrl,
    string Description,
    string InstagramHandle,
    string GoogleBusinessUrl,
    IReadOnlyList<string> BrandImageUrls,
    string PrimaryFont,
    string SecondaryFont,
    IReadOnlyList<string> BrandColors,
    IReadOnlyList<string> AccentColors,
    string CustomerVisibleSummary,
    string SystemIntelligence,
    int? DiscoveryConfidence,
    DateTime? CreativeProfileConfirmedAt
);
