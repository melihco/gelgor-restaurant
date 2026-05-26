namespace Nexus.Infrastructure.Services;

internal static class PackageQuotaLimits
{
    public static int ResolveProviderActionLimit(string? slug)
    {
        return Normalize(slug) switch
        {
            "starter" => 10,
            "growth" => 50,
            "performance" => 150,
            "executive" => -1,
            _ => 0
        };
    }

    public static int ResolveLiveProviderActionLimit(string? slug)
    {
        return Normalize(slug) switch
        {
            "starter" => 0,
            "growth" => 10,
            "performance" => 50,
            "executive" => -1,
            _ => 0
        };
    }

    public static int ResolveTokenLimit(string? slug)
    {
        return Normalize(slug) switch
        {
            "starter" => 100_000,
            "growth" => 500_000,
            "performance" => 1_500_000,
            "executive" => -1,
            _ => 0
        };
    }

    private static string Normalize(string? slug) => (slug ?? string.Empty).Trim().ToLowerInvariant();
}
