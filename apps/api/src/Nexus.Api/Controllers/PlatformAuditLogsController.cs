using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — durable audit trail (DB), not process-memory.
/// </summary>
[ApiController]
[Route("api/platform")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformAuditLogsController : PlatformProxyControllerBase
{
    private readonly NexusDbContext _db;

    public PlatformAuditLogsController(
        IPlatformCrewClient crew,
        IPermissionService permissionService,
        NexusDbContext db)
        : base(crew, permissionService)
    {
        _db = db;
    }

    /// <summary>
    /// List audit logs across tenants. Prefer <c>actionPrefix=platform.</c> for admin actions.
    /// </summary>
    [HttpGet("audit-logs")]
    public async Task<IActionResult> ListAuditLogs(
        [FromQuery] Guid? tenantId,
        [FromQuery] Guid? userId,
        [FromQuery] string? action,
        [FromQuery] string? actionPrefix,
        [FromQuery] string? entityType,
        [FromQuery] int limit = 100,
        [FromQuery] int offset = 0,
        CancellationToken cancellationToken = default)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        limit = Math.Clamp(limit, 1, 500);
        offset = Math.Max(0, offset);

        var query = _db.AuditLogs.AsNoTracking().AsQueryable();

        if (tenantId.HasValue && tenantId.Value != Guid.Empty)
            query = query.Where(a => a.TenantId == tenantId.Value);
        if (userId.HasValue && userId.Value != Guid.Empty)
            query = query.Where(a => a.UserId == userId.Value);
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(actionPrefix))
        {
            var prefix = actionPrefix.Trim();
            query = query.Where(a => a.Action.StartsWith(prefix));
        }
        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(a => a.EntityType == entityType);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip(offset)
            .Take(limit)
            .Select(a => new
            {
                id = a.Id,
                tenant_id = a.TenantId,
                user_id = a.UserId,
                action = a.Action,
                entity_type = a.EntityType,
                entity_id = a.EntityId,
                old_values = a.OldValues,
                new_values = a.NewValues,
                timestamp = a.Timestamp,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { items, total, limit, offset });
    }
}
