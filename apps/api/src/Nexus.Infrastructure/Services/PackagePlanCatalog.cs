namespace Nexus.Infrastructure.Services;

/// <summary>
/// Single source for subscription quotas, list prices (TRY), and monthly output promises.
/// Sync with apps/web/src/lib/package-plan-config.ts and backend token_billing_service.py.
/// Unit economics: ~$3.48 API per full mission cycle (propose + current 16-slot weekly produce).
/// </summary>
internal static class PackagePlanCatalog
{
    internal sealed record PlanSpec(
        string Slug,
        int AgentRunLimit,
        int ProviderActionLimit,
        int LiveProviderActionLimit,
        int LlmTokenLimit,
        int MonthlyGrantTokens,
        int MonthlyMissions,
        int MonthlySocialContent,
        int MonthlyGalleryAnalysis,
        int MonthlyReels,
        int MonthlyMetaAdCreatives,
        int MonthlyGoogleAdCreatives,
        decimal MonthlyPriceTry);

    private static readonly Dictionary<string, PlanSpec> Plans = new(StringComparer.OrdinalIgnoreCase)
    {
        ["starter"] = new(
            Slug: "starter",
            AgentRunLimit: 8,
            ProviderActionLimit: 12,
            LiveProviderActionLimit: 0,
            LlmTokenLimit: 200_000,
            MonthlyGrantTokens: 5_000,
            MonthlyMissions: 8,
            MonthlySocialContent: 96,
            MonthlyGalleryAnalysis: 40,
            MonthlyReels: 8,
            MonthlyMetaAdCreatives: 4,
            MonthlyGoogleAdCreatives: 4,
            MonthlyPriceTry: 5_990m),
        ["growth"] = new(
            Slug: "growth",
            AgentRunLimit: 16,
            ProviderActionLimit: 30,
            LiveProviderActionLimit: 8,
            LlmTokenLimit: 500_000,
            MonthlyGrantTokens: 15_000,
            MonthlyMissions: 16,
            MonthlySocialContent: 256,
            MonthlyGalleryAnalysis: 120,
            MonthlyReels: 16,
            MonthlyMetaAdCreatives: 16,
            MonthlyGoogleAdCreatives: 16,
            MonthlyPriceTry: 11_990m),
        ["performance"] = new(
            Slug: "performance",
            AgentRunLimit: 65,
            ProviderActionLimit: 140,
            LiveProviderActionLimit: 40,
            LlmTokenLimit: 1_000_000,
            MonthlyGrantTokens: 40_000,
            MonthlyMissions: 65,
            MonthlySocialContent: 650,
            MonthlyGalleryAnalysis: 250,
            MonthlyReels: 65,
            MonthlyMetaAdCreatives: 65,
            MonthlyGoogleAdCreatives: 65,
            MonthlyPriceTry: 23_008m),
        ["executive"] = new(
            Slug: "executive",
            AgentRunLimit: -1,
            ProviderActionLimit: -1,
            LiveProviderActionLimit: -1,
            LlmTokenLimit: -1,
            MonthlyGrantTokens: 150_000,
            MonthlyMissions: -1,
            MonthlySocialContent: -1,
            MonthlyGalleryAnalysis: -1,
            MonthlyReels: -1,
            MonthlyMetaAdCreatives: -1,
            MonthlyGoogleAdCreatives: -1,
            MonthlyPriceTry: 49_984m),
    };

    public static PlanSpec? TryGet(string? slug)
    {
        var key = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (Plans.TryGetValue(key, out var spec))
            return spec;
        return key switch
        {
            "studio" => Plans["starter"],
            "agency" => Plans["growth"],
            "signature" or "premium" => Plans["performance"],
            "collective" => Plans["executive"],
            _ => null,
        };
    }

    public static int ResolveAgentRunLimit(string? slug) => TryGet(slug)?.AgentRunLimit ?? 0;

    public static int ResolveProviderActionLimit(string? slug) => TryGet(slug)?.ProviderActionLimit ?? 0;

    public static int ResolveLiveProviderActionLimit(string? slug) => TryGet(slug)?.LiveProviderActionLimit ?? 0;

    public static int ResolveTokenLimit(string? slug) => TryGet(slug)?.LlmTokenLimit ?? 0;

    public static int ResolveMonthlyGrantTokens(string? slug) =>
        TryGet(slug)?.MonthlyGrantTokens ?? 5_000;
}
