namespace Nexus.Infrastructure.Services;

internal static class PackageQuotaLimits
{
    public static int ResolveProviderActionLimit(string? slug) =>
        PackagePlanCatalog.ResolveProviderActionLimit(slug);

    public static int ResolveLiveProviderActionLimit(string? slug) =>
        PackagePlanCatalog.ResolveLiveProviderActionLimit(slug);

    public static int ResolveTokenLimit(string? slug) =>
        PackagePlanCatalog.ResolveTokenLimit(slug);
}
