using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — issue a short-lived JWT scoped to a target brand tenant
/// so Users/Agents/Briefs/Tasks/Actions/Packages/Integrations/Setup resolve correctly.
/// </summary>
[ApiController]
[Route("api/platform")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformImpersonationController : PlatformProxyControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IRequestContext _requestContext;
    private readonly ILocalAuthService _authService;
    private readonly IPermissionService _permissions;

    public PlatformImpersonationController(
        IPlatformCrewClient crew,
        IPermissionService permissionService,
        NexusDbContext db,
        IRequestContext requestContext,
        ILocalAuthService authService)
        : base(crew, permissionService)
    {
        _db = db;
        _requestContext = requestContext;
        _authService = authService;
        _permissions = permissionService;
    }

    public sealed record ImpersonateRequest(
        Guid TenantId,
        Guid? OfficeId = null,
        Guid? UserId = null,
        int? SessionMinutes = null);

    /// <summary>
    /// Impersonate into a tenant as Owner/Admin (or a specific user).
    /// Returns Bearer token — does not replace the operator session cookie.
    /// </summary>
    [HttpPost("impersonate")]
    public async Task<IActionResult> Impersonate(
        [FromBody] ImpersonateRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        if (body.TenantId == Guid.Empty)
            return BadRequest(new { detail = "tenantId required" });

        var tenant = await _db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == body.TenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });
        if (!tenant.IsActive)
            return Conflict(new { detail = "tenant is suspended" });

        User? targetUser = null;
        if (body.UserId.HasValue && body.UserId.Value != Guid.Empty)
        {
            targetUser = await _db.Users.AsNoTracking()
                .FirstOrDefaultAsync(
                    u => u.Id == body.UserId.Value && u.TenantId == body.TenantId && u.IsActive,
                    cancellationToken);
            if (targetUser is null)
                return NotFound(new { detail = "target user not found in tenant" });
        }
        else
        {
            targetUser = await _db.Users.AsNoTracking()
                .Where(u => u.TenantId == body.TenantId && u.IsActive)
                .OrderBy(u => u.Role == "Owner" ? 0 : u.Role == "Admin" ? 1 : 2)
                .ThenBy(u => u.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (targetUser is null)
                return Conflict(new { detail = "tenant has no active users to impersonate" });
        }

        var officeId = body.OfficeId is { } oid && oid != Guid.Empty
            ? oid
            : await _db.Offices.AsNoTracking()
                .Where(o => o.TenantId == body.TenantId)
                .OrderBy(o => o.CreatedAt)
                .Select(o => o.Id)
                .FirstOrDefaultAsync(cancellationToken);

        if (officeId == Guid.Empty)
            return Conflict(new { detail = "tenant has no office/workspace" });

        var actor = await _permissions.GetCurrentUserAsync(cancellationToken);
        var minutes = Math.Clamp(body.SessionMinutes ?? 60, 5, 240);
        var token = _authService.CreateSessionToken(
            targetUser,
            officeId,
            new Dictionary<string, object?>
            {
                ["impersonator_user_id"] = actor.UserId.ToString(),
                ["impersonator_tenant_id"] = actor.TenantId.ToString(),
                ["impersonation"] = "true",
            },
            minutes);

        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = actor.TenantId == Guid.Empty ? body.TenantId : actor.TenantId,
            UserId = actor.UserId == Guid.Empty ? targetUser.Id : actor.UserId,
            Action = "platform.impersonate",
            EntityType = "Tenant",
            EntityId = body.TenantId,
            OldValues = "{}",
            NewValues = JsonSerializer.Serialize(new
            {
                target_tenant_id = body.TenantId,
                target_user_id = targetUser.Id,
                target_office_id = officeId,
                impersonator_user_id = actor.UserId,
                impersonator_tenant_id = actor.TenantId,
                session_minutes = minutes,
            }),
            Timestamp = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            access_token = token,
            token_type = "Bearer",
            expires_in = minutes * 60,
            tenant_id = body.TenantId,
            office_id = officeId,
            user_id = targetUser.Id,
            user_email = targetUser.Email,
            user_role = targetUser.Role,
            impersonator_user_id = actor.UserId,
            impersonator_tenant_id = actor.TenantId,
        });
    }
}
