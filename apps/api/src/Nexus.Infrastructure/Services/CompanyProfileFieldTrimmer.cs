using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Services;

/// <summary>
/// Keeps CompanyProfile string fields within EF column limits so discovery/save never fails on overflow.
/// </summary>
public static class CompanyProfileFieldTrimmer
{
    public static void Apply(CompanyProfile profile)
    {
        profile.BrandName = Truncate(profile.BrandName, 200);
        profile.Industry = Truncate(profile.Industry, 100);
        profile.Location = Truncate(profile.Location, 200);
        profile.BrandTone = Truncate(profile.BrandTone, 50);
        profile.TargetAudience = Truncate(profile.TargetAudience, 500);
        profile.VisualStyle = Truncate(profile.VisualStyle, 200);
        profile.CampaignGoals = Truncate(profile.CampaignGoals, 1000);
        profile.Competitors = Truncate(profile.Competitors, 500);
        profile.CustomRules = Truncate(profile.CustomRules, 2000);
        profile.Languages = Truncate(profile.Languages, 50);
        profile.LogoUrl = Truncate(profile.LogoUrl, 500);
        profile.WebsiteUrl = Truncate(profile.WebsiteUrl, 500);
        profile.Description = Truncate(profile.Description, 2000);
        profile.PrimaryFont = Truncate(profile.PrimaryFont, 100);
        profile.SecondaryFont = Truncate(profile.SecondaryFont, 100);
        profile.BrandColors = Truncate(profile.BrandColors, 500);
        profile.AccentColors = Truncate(profile.AccentColors, 500);
        profile.SocialTemplateStyle = Truncate(profile.SocialTemplateStyle, 1000);
        profile.LogoUsageRules = Truncate(profile.LogoUsageRules, 1000);
        profile.InstagramHandle = Truncate(profile.InstagramHandle, 100);
        profile.GoogleBusinessUrl = Truncate(profile.GoogleBusinessUrl, 500);
        profile.BrandImageUrls = Truncate(profile.BrandImageUrls, 2000);
        profile.BrandAnalysis = Truncate(profile.BrandAnalysis, 12000);
        profile.CustomerVisibleSummary = Truncate(profile.CustomerVisibleSummary, 2000);
        profile.SystemIntelligence = Truncate(profile.SystemIntelligence, 24000);
    }

    internal static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            return value ?? string.Empty;

        return value[..maxLength];
    }

    public static string TruncateForStorage(string? value, int maxLength) => Truncate(value, maxLength);
}
