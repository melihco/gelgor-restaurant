namespace Nexus.Infrastructure.Services;

/// <summary>
/// Single source for subscription quotas and monthly output promises (Usage &amp; Plan UI).
/// Values align with credit-pack economics (~7 posts/mission, ~36 kr/mission core).
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
        decimal MonthlyPriceTry);

    private static readonly Dictionary<string, PlanSpec> Plans = new(StringComparer.OrdinalIgnoreCase)
    {
        // Pilot / dev scale (~4×) — prod fiyatlar aynı; kota Feed + misyon testleri için genişletildi.
        ["starter"] = new(
            Slug: "starter",
            AgentRunLimit: 50,
            ProviderActionLimit: 60,
            LiveProviderActionLimit: 4,
            LlmTokenLimit: 800_000,
            MonthlyGrantTokens: 20_000,
            MonthlyMissions: 50,
            MonthlySocialContent: 350,
            MonthlyGalleryAnalysis: 160,
            MonthlyReels: 4,
            MonthlyPriceTry: 2_528m),
        ["growth"] = new(
            Slug: "growth",
            AgentRunLimit: 120,
            ProviderActionLimit: 180,
            LiveProviderActionLimit: 32,
            LlmTokenLimit: 2_000_000,
            MonthlyGrantTokens: 60_000,
            MonthlyMissions: 120,
            MonthlySocialContent: 800,
            MonthlyGalleryAnalysis: 480,
            MonthlyReels: 16,
            MonthlyPriceTry: 4_768m),
        ["performance"] = new(
            Slug: "performance",
            AgentRunLimit: 260,
            ProviderActionLimit: 560,
            LiveProviderActionLimit: 160,
            LlmTokenLimit: 4_000_000,
            MonthlyGrantTokens: 160_000,
            MonthlyMissions: 260,
            MonthlySocialContent: 1_820,
            MonthlyGalleryAnalysis: 1_000,
            MonthlyReels: 32,
            MonthlyPriceTry: 7_968m),
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
            MonthlyPriceTry: 15_968m),
    };

    public static PlanSpec? TryGet(string? slug)
    {
        var key = (slug ?? string.Empty).Trim().ToLowerInvariant();
        return Plans.TryGetValue(key, out var spec) ? spec : null;
    }

    public static int ResolveAgentRunLimit(string? slug) => TryGet(slug)?.AgentRunLimit ?? 0;

    public static int ResolveProviderActionLimit(string? slug) => TryGet(slug)?.ProviderActionLimit ?? 0;

    public static int ResolveLiveProviderActionLimit(string? slug) => TryGet(slug)?.LiveProviderActionLimit ?? 0;

    public static int ResolveTokenLimit(string? slug) => TryGet(slug)?.LlmTokenLimit ?? 0;

    public static int ResolveMonthlyGrantTokens(string? slug) =>
        TryGet(slug)?.MonthlyGrantTokens ?? 25_000;
}
