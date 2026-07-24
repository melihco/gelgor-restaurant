using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure.Data;
using Microsoft.AspNetCore.Http;

namespace Nexus.Api.Services;

public static class Permissions
{
    public const string ActionsApprove = "actions.approve";
    public const string ActionsReject = "actions.reject";
    public const string ProviderExecuteDryRun = "provider.execute.dry_run";
    public const string ProviderExecuteLive = "provider.execute.live";
    public const string ArtifactsReview = "artifacts.review";
    public const string IntegrationsManage = "integrations.manage";
    public const string BillingManage = "billing.manage";
    public const string UsersManage = "users.manage";
    public const string OperationsView = "operations.view";
    public const string AgentsExecute = "agents.execute";
    /// <summary>Super Admin / platform console — cross-tenant crew proxies.</summary>
    public const string PlatformOperate = "platform.operate";
}

public record CurrentUserSecurityDto(
    Guid UserId,
    Guid TenantId,
    string TenantName,
    string Role,
    string DisplayName,
    string Email,
    string[] Permissions,
    bool IsDemoFallback);

public interface IPermissionService
{
    Task<CurrentUserSecurityDto> GetCurrentUserAsync(CancellationToken cancellationToken = default);
    Task<bool> HasPermissionAsync(string permission, CancellationToken cancellationToken = default);
}

public sealed class PermissionService : IPermissionService
{
    private static readonly string[] AllPermissions = new[]
    {
        Permissions.ActionsApprove,
        Permissions.ActionsReject,
        Permissions.ProviderExecuteDryRun,
        Permissions.ProviderExecuteLive,
        Permissions.ArtifactsReview,
        Permissions.IntegrationsManage,
        Permissions.BillingManage,
        Permissions.UsersManage,
        Permissions.OperationsView,
        Permissions.AgentsExecute,
        Permissions.PlatformOperate,
    };

    private static readonly string[] TrustedInternalPlatformPermissions = AllPermissions;

    private static readonly IReadOnlyDictionary<string, string[]> RolePermissions =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["Owner"] = AllPermissions,
            ["Admin"] = AllPermissions,
            ["Manager"] = new[]
            {
                Permissions.ActionsApprove,
                Permissions.ActionsReject,
                Permissions.ProviderExecuteDryRun,
                Permissions.ArtifactsReview,
                Permissions.IntegrationsManage,
                Permissions.OperationsView,
                Permissions.AgentsExecute
            },
            ["Reviewer"] = new[]
            {
                Permissions.ActionsApprove,
                Permissions.ActionsReject,
                Permissions.ArtifactsReview,
                Permissions.OperationsView
            },
            ["Operator"] = new[]
            {
                Permissions.ProviderExecuteDryRun,
                Permissions.OperationsView,
                Permissions.AgentsExecute
            },
            ["Analyst"] = new[]
            {
                Permissions.OperationsView
            },
            ["Viewer"] = new[]
            {
                Permissions.OperationsView
            },
            ["User"] = new[]
            {
                Permissions.ProviderExecuteDryRun,
                Permissions.OperationsView
            }
        };

    private readonly NexusDbContext _db;
    private readonly IRequestContext _requestContext;
    private readonly IConfiguration _configuration;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public PermissionService(
        NexusDbContext db,
        IRequestContext requestContext,
        IConfiguration configuration,
        IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _requestContext = requestContext;
        _configuration = configuration;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<CurrentUserSecurityDto> GetCurrentUserAsync(CancellationToken cancellationToken = default)
    {
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(
                u => u.Id == _requestContext.UserId &&
                     u.TenantId == _requestContext.TenantId &&
                     u.IsActive,
                cancellationToken);

        var role = user?.Role;
        if (string.IsNullOrWhiteSpace(role))
        {
            role = _requestContext.IsDemoFallback ? "Admin" : "Viewer";
        }

        var permissions = ResolvePermissions(role);
        if (ShouldElevateToPlatformAdmin(user?.Email))
        {
            permissions = AllPermissions;
            if (string.IsNullOrWhiteSpace(role) || role.Equals("Viewer", StringComparison.OrdinalIgnoreCase))
                role = "Admin";
        }

        var tenantName = await _db.Tenants
            .AsNoTracking()
            .Where(t => t.Id == _requestContext.TenantId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(cancellationToken);

        return new CurrentUserSecurityDto(
            _requestContext.UserId,
            _requestContext.TenantId,
            tenantName ?? string.Empty,
            role,
            user?.DisplayName ?? (_requestContext.IsDemoFallback ? "Demo Admin" : "Unknown User"),
            user?.Email ?? string.Empty,
            permissions,
            _requestContext.IsDemoFallback);
    }

    public async Task<bool> HasPermissionAsync(string permission, CancellationToken cancellationToken = default)
    {
        // Next platform-admin BFF: INTERNAL_API_KEY + X-Platform-Admin + X-Tenant-Id
        // unlocks tenant-scoped Users/Agents/Briefs/Tasks/Actions/Packages/Integrations/Setup.
        if (_requestContext.IsTrustedInternal
            && PlatformAdminAccess.HasPlatformAdminHeader(_httpContextAccessor.HttpContext)
            && TrustedInternalPlatformPermissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
        {
            return true;
        }

        var currentUser = await GetCurrentUserAsync(cancellationToken);
        return currentUser.Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }

    private bool ShouldElevateToPlatformAdmin(string? email)
    {
        if (!PlatformAdminAccess.EmailAllowlistConfigured(_configuration))
            return false;
        return PlatformAdminAccess.IsPlatformAdminEmail(email, _configuration);
    }

    private static string[] ResolvePermissions(string role)
        => RolePermissions.TryGetValue(role, out var permissions) ? permissions : RolePermissions["Viewer"];
}
