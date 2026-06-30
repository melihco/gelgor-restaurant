using System.Text.Json;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;

namespace Nexus.Application.Services;

/// <summary>
/// Builds the <see cref="CrewBrandContext"/> passed to the CrewAI orchestration
/// service from the tenant's persisted brand data (company profile, brand memory,
/// office, learning enrichment).
///
/// Extracted out of AgentService so brand-context assembly is a single cohesive,
/// unit-testable unit (SRP) rather than ~150 lines inlined in the executor.
/// </summary>
public static class CrewBrandContextFactory
{
    public static CrewBrandContext Build(
        Tenant tenant,
        Office? office,
        List<BrandMemoryDocument> brandMemories,
        CompanyProfile? profile,
        string promptEnrichment)
    {
        var customRules = profile?.CustomRules ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(promptEnrichment))
            customRules = string.IsNullOrWhiteSpace(customRules) ? promptEnrichment : $"{customRules}\n\n{promptEnrichment}";

        // Inject brand analysis from connected accounts (Instagram, Google Business)
        var assetDescriptions = brandMemories
            .Where(m =>
                m.DocumentType.StartsWith("brand_profile:") ||
                m.DocumentType.StartsWith("executed_action:") ||
                m.DocumentType == "approved_pattern")
            .Take(8)
            .Select(m => $"{m.DocumentType}: {m.Title}")
            .ToList();

        if (!string.IsNullOrWhiteSpace(profile?.InstagramHandle))
            assetDescriptions.Insert(0, $"Instagram hesabı: @{profile.InstagramHandle}");

        if (!string.IsNullOrWhiteSpace(profile?.GoogleBusinessUrl))
            assetDescriptions.Insert(0, $"Google Business: {profile.GoogleBusinessUrl}");

        if (!string.IsNullOrWhiteSpace(profile?.BrandImageUrls))
        {
            var urls = profile.BrandImageUrls.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var url in urls.Take(5))
                assetDescriptions.Add($"Marka görseli: {url}");
        }

        // Brand analysis from automatic account scan — inject as high-priority context
        if (!string.IsNullOrWhiteSpace(profile?.BrandAnalysis))
        {
            customRules = $"## Otomatik Marka Analizi (Hesap Verilerinden)\n{profile.BrandAnalysis}\n\n" + customRules;
        }

        return new CrewBrandContext
        {
            BusinessName = profile?.BrandName ?? office?.Name ?? tenant.Name,
            BusinessType = profile?.Industry ?? "Digital Agency Client Workspace",
            Description = profile?.Description ?? office?.Description ?? $"Managed workspace for {tenant.Name}",
            BrandTone = profile?.BrandTone ?? "professional and warm",
            VisualStyle = profile?.VisualStyle ?? "modern, premium, digitally native",
            TargetAudience = profile?.TargetAudience ?? "local customers and agency-managed growth audiences",
            Location = profile?.Location ?? office?.Name ?? tenant.Name,
            Languages = profile?.Languages ?? "tr",
            CampaignGoals = BuildCampaignGoals(profile),
            Competitors = profile?.Competitors ?? string.Empty,
            CustomRules = customRules,
            Keywords = BuildKeywords(tenant, profile),
            AssetDescriptions = assetDescriptions,
            ContentPillars = ParseJsonStringList(profile?.ContentNeeds),
            RiskRules = ParseJsonStringDictionary(profile?.RiskRules),
            OperatingCapabilities = ParseJsonStringList(profile?.OperatingCapabilities),
            GalleryPolicy = ParseJsonObjectDictionary(profile?.GalleryPolicy),
        };
    }

    private static List<string> ParseJsonStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json)?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .ToList() ?? new();
        }
        catch
        {
            return new();
        }
    }

    private static Dictionary<string, string> ParseJsonStringDictionary(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                   ?? new Dictionary<string, string>();
        }
        catch
        {
            return new();
        }
    }

    private static Dictionary<string, object?> ParseJsonObjectDictionary(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            using var doc = JsonDocument.Parse(json);
            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.TryGetInt32(out var i) ? i : prop.Value.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => prop.Value.GetRawText(),
                };
            }
            return dict;
        }
        catch
        {
            return new();
        }
    }

    private static string BuildCampaignGoals(CompanyProfile? profile)
    {
        var baseGoals = profile?.CampaignGoals;
        if (string.IsNullOrWhiteSpace(baseGoals))
        {
            baseGoals = "Protect reputation, improve response quality, and create actionable agency workflows.";
        }

        var additions = new List<string>();
        if (!string.IsNullOrWhiteSpace(profile?.TargetAudience))
            additions.Add($"Target audience focus: {profile.TargetAudience}");
        if (!string.IsNullOrWhiteSpace(profile?.Competitors))
            additions.Add($"Competitor awareness: {profile.Competitors}");
        if (!string.IsNullOrWhiteSpace(profile?.WebsiteUrl))
            additions.Add($"Website: {profile.WebsiteUrl}");

        return additions.Count == 0
            ? baseGoals
            : $"{baseGoals}\n{string.Join("\n", additions)}";
    }

    private static string BuildKeywords(Tenant tenant, CompanyProfile? profile)
    {
        var keywords = new List<string> { tenant.Plan };
        if (!string.IsNullOrWhiteSpace(profile?.Industry)) keywords.Add(profile.Industry);
        if (!string.IsNullOrWhiteSpace(profile?.Location)) keywords.Add(profile.Location);
        if (!string.IsNullOrWhiteSpace(profile?.Competitors)) keywords.Add(profile.Competitors);
        return string.Join(", ", keywords.Where(k => !string.IsNullOrWhiteSpace(k)).Distinct());
    }
}
