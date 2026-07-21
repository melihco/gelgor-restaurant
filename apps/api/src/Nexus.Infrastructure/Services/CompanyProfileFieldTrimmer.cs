using System.Text;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Services;

/// <summary>
/// Keeps CompanyProfile string fields within EF column limits so discovery/save never fails on overflow.
/// Also strips characters PostgreSQL cannot store in text/varchar (NUL and other C0 controls).
/// </summary>
public static class CompanyProfileFieldTrimmer
{
    public static void Apply(CompanyProfile profile)
    {
        profile.BrandName = Truncate(Sanitize(profile.BrandName), 200);
        profile.Industry = Truncate(Sanitize(profile.Industry), 100);
        profile.Location = Truncate(Sanitize(profile.Location), 200);
        profile.BrandTone = Truncate(Sanitize(profile.BrandTone), 50);
        profile.TargetAudience = Truncate(Sanitize(profile.TargetAudience), 500);
        profile.VisualStyle = Truncate(Sanitize(profile.VisualStyle), 200);
        profile.CampaignGoals = Truncate(Sanitize(profile.CampaignGoals), 1000);
        profile.Competitors = Truncate(Sanitize(profile.Competitors), 500);
        profile.CustomRules = Truncate(Sanitize(profile.CustomRules), 2000);
        profile.Languages = Truncate(Sanitize(profile.Languages), 50);
        profile.LogoUrl = Truncate(Sanitize(profile.LogoUrl), 500);
        profile.WebsiteUrl = Truncate(Sanitize(profile.WebsiteUrl), 500);
        profile.Description = Truncate(Sanitize(profile.Description), 2000);
        profile.PrimaryFont = Truncate(Sanitize(profile.PrimaryFont), 100);
        profile.SecondaryFont = Truncate(Sanitize(profile.SecondaryFont), 100);
        profile.BrandColors = Truncate(Sanitize(profile.BrandColors), 500);
        profile.AccentColors = Truncate(Sanitize(profile.AccentColors), 500);
        profile.SocialTemplateStyle = Truncate(Sanitize(profile.SocialTemplateStyle), 1000);
        profile.InstagramHandle = Truncate(Sanitize(profile.InstagramHandle), 100);
        profile.GoogleBusinessUrl = Truncate(Sanitize(profile.GoogleBusinessUrl), 500);
        profile.BrandAnalysis = Truncate(Sanitize(profile.BrandAnalysis), 12000);
        profile.CustomerVisibleSummary = Truncate(Sanitize(profile.CustomerVisibleSummary), 2000);
        profile.SystemIntelligence = Truncate(Sanitize(profile.SystemIntelligence), 24000);
        profile.PlatformProfiles = Sanitize(profile.PlatformProfiles);
        profile.ContentNeeds = Sanitize(profile.ContentNeeds);
        profile.OperatingCapabilities = Sanitize(profile.OperatingCapabilities);
        profile.GalleryPolicy = Sanitize(profile.GalleryPolicy);
        profile.TemplateFamilies = Sanitize(profile.TemplateFamilies);
        profile.RiskRules = Sanitize(profile.RiskRules);
    }

    /// <summary>
    /// PostgreSQL rejects NUL (0x00) in text columns. Strip C0 controls except tab/LF/CR.
    /// </summary>
    public static string Sanitize(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return value ?? string.Empty;

        var needsSanitize = false;
        foreach (var ch in value)
        {
            if (ch < 32 && ch is not ('\t' or '\n' or '\r'))
            {
                needsSanitize = true;
                break;
            }
        }

        if (!needsSanitize)
            return value;

        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (ch == '\t' || ch == '\n' || ch == '\r' || ch >= 32)
                sb.Append(ch);
        }

        return sb.ToString();
    }

    internal static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            return value ?? string.Empty;

        return value[..maxLength];
    }

    public static string TruncateForStorage(string? value, int maxLength) =>
        Truncate(Sanitize(value), maxLength);
}
