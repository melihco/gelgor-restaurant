using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class SetupService : ISetupService
{
    private readonly NexusDbContext _context;

    public SetupService(NexusDbContext context)
    {
        _context = context;
    }

    public async Task<CompanyProfileDto> GetCompanyProfileAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var profile = await _context.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

        if (profile == null)
        {
            profile = new CompanyProfile
            {
                TenantId = tenantId,
                BrandName = string.Empty,
            };
            _context.CompanyProfiles.Add(profile);
            await _context.SaveChangesAsync(cancellationToken);
        }

        return MapToDto(profile);
    }

    public async Task<CompanyProfileDto> SaveCompanyProfileAsync(Guid tenantId, SaveCompanyProfileRequest request, CancellationToken cancellationToken = default)
    {
        var profile = await _context.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

        if (profile == null)
        {
            profile = new CompanyProfile { TenantId = tenantId };
            _context.CompanyProfiles.Add(profile);
        }

        profile.BrandName = request.BrandName;
        profile.Industry = request.Industry;
        profile.Location = request.Location;
        profile.BrandTone = request.BrandTone;
        profile.TargetAudience = request.TargetAudience;
        profile.VisualStyle = request.VisualStyle;
        profile.CampaignGoals = request.CampaignGoals;
        profile.Competitors = request.Competitors;
        profile.CustomRules = request.CustomRules;
        profile.Languages = request.Languages;
        profile.LogoUrl = request.LogoUrl;
        profile.WebsiteUrl = request.WebsiteUrl;
        profile.Description = request.Description;
        profile.PrimaryFont = request.PrimaryFont ?? "";
        profile.SecondaryFont = request.SecondaryFont ?? "";
        profile.BrandColors = request.BrandColors ?? "";
        profile.AccentColors = request.AccentColors ?? "";
        profile.SocialTemplateStyle = request.SocialTemplateStyle ?? "";
        profile.LogoUsageRules = request.LogoUsageRules ?? "";
        profile.DefaultApprovalMode = request.DefaultApprovalMode;
        profile.InstagramHandle = request.InstagramHandle ?? "";
        profile.GoogleBusinessUrl = request.GoogleBusinessUrl ?? "";
        profile.BrandImageUrls = request.BrandImageUrls ?? "";
        profile.PlatformProfiles = NormalizeJson(request.PlatformProfiles, "[]");
        profile.ContentNeeds = NormalizeJson(request.ContentNeeds, "[]");
        profile.OperatingCapabilities = NormalizeJson(request.OperatingCapabilities, "[]");
        profile.GalleryPolicy = NormalizeJson(request.GalleryPolicy, "{}");
        profile.TemplateFamilies = NormalizeJson(request.TemplateFamilies, "[]");
        profile.RiskRules = NormalizeJson(request.RiskRules, "{}");
        profile.CustomerVisibleSummary = request.CustomerVisibleSummary ?? "";
        profile.SystemIntelligence = request.SystemIntelligence ?? "";
        profile.DiscoveryConfidence = request.DiscoveryConfidence;
        profile.CreativeProfileConfirmedAt = request.CreativeProfileConfirmedAt;
        profile.UpdatedAt = DateTime.UtcNow;
        CompanyProfileFieldTrimmer.Apply(profile);

        await _context.SaveChangesAsync(cancellationToken);
        return MapToDto(profile);
    }

    public async Task<CompanyProfileDto> CompleteSetupAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var profile = await _context.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken)
            ?? throw new InvalidOperationException("Company profile not found");

        profile.SetupCompleted = true;
        profile.SetupCompletedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return MapToDto(profile);
    }

    private static CompanyProfileDto MapToDto(CompanyProfile p) => new(
        p.Id,
        p.BrandName,
        p.Industry,
        p.Location,
        p.BrandTone,
        p.TargetAudience,
        p.VisualStyle,
        p.CampaignGoals,
        p.Competitors,
        p.CustomRules,
        p.Languages,
        p.LogoUrl,
        p.WebsiteUrl,
        p.Description,
        p.PrimaryFont,
        p.SecondaryFont,
        p.BrandColors,
        p.AccentColors,
        p.SocialTemplateStyle,
        p.LogoUsageRules,
        p.DefaultApprovalMode,
        p.SetupCompleted,
        p.SetupCompletedAt,
        p.InstagramHandle,
        p.GoogleBusinessUrl,
        p.BrandImageUrls,
        p.BrandAnalysis,
        p.BrandAnalyzedAt,
        p.PlatformProfiles,
        p.ContentNeeds,
        p.OperatingCapabilities,
        p.GalleryPolicy,
        p.TemplateFamilies,
        p.RiskRules,
        p.CustomerVisibleSummary,
        p.SystemIntelligence,
        p.DiscoveryConfidence,
        p.CreativeProfileConfirmedAt);

    private static string NormalizeJson(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        try
        {
            System.Text.Json.JsonDocument.Parse(value);
            return value;
        }
        catch
        {
            return fallback;
        }
    }
}
