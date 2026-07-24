namespace Nexus.Api.Services;

/// <summary>
/// Shared Super Admin identity helpers — email allowlist + trusted internal platform header.
/// </summary>
public static class PlatformAdminAccess
{
    public const string PlatformAdminHeaderName = "X-Platform-Admin";

    public static bool IsPlatformAdminEmail(string? email, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var normalized = email.Trim().ToLowerInvariant();
        foreach (var allowed in GetAdminEmails(configuration))
        {
            if (string.Equals(allowed, normalized, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }

    public static bool HasPlatformAdminHeader(HttpContext? httpContext)
    {
        var raw = httpContext?.Request.Headers[PlatformAdminHeaderName].FirstOrDefault()?.Trim();
        return string.Equals(raw, "1", StringComparison.Ordinal)
            || string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// When PLATFORM_ADMIN_EMAILS is unset/empty, email allowlist is not enforced
    /// (Owner/Admin permissions still apply). When set, only listed emails get
    /// elevated platform access via <see cref="PermissionService"/>.
    /// </summary>
    public static bool EmailAllowlistConfigured(IConfiguration configuration)
        => GetAdminEmails(configuration).Count > 0;

    public static IReadOnlyList<string> GetAdminEmails(IConfiguration configuration)
    {
        var fromEnv = Environment.GetEnvironmentVariable("PLATFORM_ADMIN_EMAILS");
        var raw = !string.IsNullOrWhiteSpace(fromEnv)
            ? fromEnv
            : configuration["Platform:AdminEmails"];
        if (string.IsNullOrWhiteSpace(raw)) return Array.Empty<string>();

        return raw
            .Split(new[] { ',', ';', ' ', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim().ToLowerInvariant())
            .Where(s => s.Contains('@'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
