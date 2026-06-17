using System.Security.Claims;

namespace Nexus.Api.Services;

public interface IRequestContext
{
    Guid TenantId { get; }
    Guid UserId { get; }
    Guid OfficeId { get; }
    bool IsDemoFallback { get; }
}

public sealed class RequestContext : IRequestContext
{
    private static readonly Guid DefaultDemoTenantId = new("00000000-0000-0000-0000-000000000001");
    private static readonly Guid DefaultDemoUserId = new("00000000-0000-0000-0000-000000000001");
    private static readonly Guid DefaultDemoOfficeId = new("00000000-0000-0000-0000-000000000002");
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public RequestContext(
        IHttpContextAccessor httpContextAccessor,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
        _environment = environment;
    }

    public Guid TenantId =>
        ResolveGuid(
            "X-Tenant-Id",
            new[] { "tenant_id" },
            "Tenant:DemoTenantId",
            DefaultDemoTenantId);

    public Guid UserId =>
        ResolveGuid(
            "X-User-Id",
            new[] { ClaimTypes.NameIdentifier, "sub" },
            "Tenant:DemoUserId",
            DefaultDemoUserId);

    public Guid OfficeId =>
        ResolveGuid(
            "X-Office-Id",
            new[] { "office_id" },
            "Tenant:DemoOfficeId",
            DefaultDemoOfficeId);

    public bool IsDemoFallback =>
        AllowDemoFallback &&
        !(TrustClientHeaders && TryGetHeaderGuid("X-Tenant-Id", out _)) &&
        !TryGetAnyClaimGuid(new[] { "tenant_id" }, out _);

    private Guid ResolveGuid(string headerName, string[] claimNames, string configKey, Guid fallback)
    {
        if (TryGetAnyClaimGuid(claimNames, out var claimValue))
            return claimValue;

        if (IsTrustedInternalRequest())
        {
            if (TryGetHeaderGuid(headerName, out var internalHeader))
                return internalHeader;

            // Service callers (Next.js auto-produce, Python crew) often send only X-Tenant-Id.
            if (TryGetHeaderGuid("X-Tenant-Id", out var tenantHeader) && tenantHeader != Guid.Empty)
            {
                if (headerName == "X-User-Id") return DefaultDemoUserId;
                if (headerName == "X-Office-Id") return DefaultDemoOfficeId;
            }
        }

        if (TrustClientHeaders && TryGetHeaderGuid(headerName, out var headerValue))
            return headerValue;

        if (AllowDemoFallback)
        {
            var configured = _configuration[configKey];
            return Guid.TryParse(configured, out var configValue) ? configValue : fallback;
        }

        return Guid.Empty;
    }

    private bool IsTrustedInternalRequest()
    {
        var configured = GetConfiguredInternalApiKey();
        var provided = _httpContextAccessor.HttpContext?.Request.Headers["X-Internal-Api-Key"]
            .FirstOrDefault()
            ?.Trim();
        return !string.IsNullOrEmpty(provided)
            && string.Equals(provided, configured, StringComparison.Ordinal);
    }

    private string GetConfiguredInternalApiKey()
    {
        var fromEnv = Environment.GetEnvironmentVariable("INTERNAL_API_KEY");
        if (!string.IsNullOrWhiteSpace(fromEnv))
            return fromEnv.Trim();

        var fromConfig = _configuration["OrchestrationService:ApiKey"];
        if (!string.IsNullOrWhiteSpace(fromConfig))
            return fromConfig.Trim();

        return "smartagency-internal-dev-key";
    }

    // Production hard-guards: client headers and demo fallback are NEVER trusted
    // in production, regardless of config. This blocks accidental misconfiguration
    // that would allow tenant spoofing via X-Tenant-Id / X-User-Id headers.
    private bool TrustClientHeaders =>
        _environment.IsDevelopment() &&
        (_configuration.GetValue<bool?>("Tenant:TrustClientHeaders") ?? true);

    private bool AllowDemoFallback =>
        _environment.IsDevelopment() &&
        (_configuration.GetValue<bool?>("Tenant:AllowDemoFallback") ?? true);

    private bool TryGetHeaderGuid(string headerName, out Guid value)
    {
        value = Guid.Empty;
        var raw = _httpContextAccessor.HttpContext?.Request.Headers[headerName].FirstOrDefault();
        return Guid.TryParse(raw, out value);
    }

    private bool TryGetAnyClaimGuid(IEnumerable<string> claimNames, out Guid value)
    {
        foreach (var claimName in claimNames)
        {
            value = Guid.Empty;
            var raw = _httpContextAccessor.HttpContext?.User.FindFirstValue(claimName);
            if (Guid.TryParse(raw, out value))
                return true;
        }

        value = Guid.Empty;
        return false;
    }
}
