using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — cross-tenant user management + tenant/workspace bootstrap.
/// </summary>
[ApiController]
[Route("api/platform")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformUsersController : PlatformProxyControllerBase
{
    private static readonly string[] AllowedRoles =
        { "Owner", "Admin", "Manager", "Reviewer", "Operator", "Analyst", "Viewer", "User" };

    private readonly NexusDbContext _db;
    private readonly PlatformTenantBootstrapService _bootstrap;

    public PlatformUsersController(
        IPlatformCrewClient crew,
        IPermissionService permissionService,
        NexusDbContext db,
        PlatformTenantBootstrapService bootstrap)
        : base(crew, permissionService)
    {
        _db = db;
        _bootstrap = bootstrap;
    }

    /// <summary>
    /// Create Nexus tenant + office + company profile + optional owner,
    /// then bootstrap Python mirror (brand stub + slot assignments).
    /// Alias of <c>POST /api/platform/tenants/bootstrap</c>.
    /// </summary>
    [HttpPost("tenants")]
    public Task<IActionResult> CreateTenant(
        [FromBody] PlatformTenantBootstrapRequest body,
        CancellationToken cancellationToken)
        => BootstrapTenant(body, cancellationToken);

    /// <summary>
    /// Create Nexus tenant + office + company profile + optional owner,
    /// then bootstrap Python mirror (brand stub + slot assignments).
    /// </summary>
    [HttpPost("tenants/bootstrap")]
    public async Task<IActionResult> BootstrapTenant(
        [FromBody] PlatformTenantBootstrapRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        try
        {
            var result = await _bootstrap.BootstrapAsync(body, cancellationToken);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { detail = ex.Message });
        }
    }

    /// <summary>Re-run Python mirror bootstrap for an existing Nexus tenant.</summary>
    [HttpPost("tenants/{tenantId:guid}/bootstrap-python")]
    public async Task<IActionResult> BootstrapPythonMirror(
        Guid tenantId,
        [FromBody] PlatformPythonBootstrapRequest? body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants.AsNoTracking()
            .Include(t => t.CompanyProfile)
            .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        var profile = tenant.CompanyProfile;
        var payload = new
        {
            workspace_id = tenantId,
            business_name = body?.BusinessName ?? profile?.BrandName ?? tenant.Name,
            business_type = body?.BusinessType ?? profile?.Industry,
            sector_id = body?.SectorId ?? profile?.Industry,
            location = body?.Location ?? profile?.Location,
            languages = body?.Languages ?? profile?.Languages ?? "tr",
            website_url = body?.WebsiteUrl ?? profile?.WebsiteUrl,
            instagram_handle = body?.InstagramHandle ?? profile?.InstagramHandle,
            bootstrap_slots = body?.BootstrapSlots ?? true,
            create_brand_stub = body?.CreateBrandStub ?? true,
        };

        return await ProxyJsonAsync(
            HttpMethod.Post,
            tenantId,
            "/api/v1/platform/bootstrap",
            cancellationToken,
            forwardBody: false,
            overrideBodyJson: System.Text.Json.JsonSerializer.Serialize(payload));
    }

    /// <summary>List offices (workspace shells) for a tenant.</summary>
    [HttpGet("tenants/{tenantId:guid}/workspaces")]
    public async Task<IActionResult> ListWorkspaces(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var exists = await _db.Tenants.AnyAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (!exists)
            return NotFound(new { detail = "tenant not found" });

        var offices = await _db.Offices.AsNoTracking()
            .Where(o => o.TenantId == tenantId)
            .OrderByDescending(o => o.IsDefault)
            .ThenBy(o => o.CreatedAt)
            .Select(o => new
            {
                id = o.Id,
                tenant_id = o.TenantId,
                name = o.Name,
                description = o.Description,
                is_default = o.IsDefault,
                created_at = o.CreatedAt,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { tenant_id = tenantId, items = offices, total = offices.Count });
    }

    /// <summary>Create an additional office under a tenant.</summary>
    [HttpPost("tenants/{tenantId:guid}/workspaces")]
    public async Task<IActionResult> CreateWorkspace(
        Guid tenantId,
        [FromBody] PlatformCreateWorkspaceRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var exists = await _db.Tenants.AnyAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (!exists)
            return NotFound(new { detail = "tenant not found" });

        var name = (body.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { detail = "name is required" });

        if (body.IsDefault)
        {
            var defaults = await _db.Offices.Where(o => o.TenantId == tenantId && o.IsDefault).ToListAsync(cancellationToken);
            foreach (var d in defaults)
                d.IsDefault = false;
        }

        var office = new Office
        {
            TenantId = tenantId,
            Name = name,
            Description = body.Description ?? string.Empty,
            IsDefault = body.IsDefault,
            Configuration = "{}",
        };
        _db.Offices.Add(office);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            id = office.Id,
            tenant_id = office.TenantId,
            name = office.Name,
            description = office.Description,
            is_default = office.IsDefault,
        });
    }

    [HttpGet("tenants/{tenantId:guid}/users")]
    public async Task<IActionResult> ListTenantUsers(
        Guid tenantId,
        [FromQuery] string? q,
        [FromQuery] bool? isActive,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var query = _db.Users.AsNoTracking().Where(u => u.TenantId == tenantId && !u.IsDeleted);
        if (isActive.HasValue)
            query = query.Where(u => u.IsActive == isActive.Value);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.Email.ToLower().Contains(needle) || u.DisplayName.ToLower().Contains(needle));
        }

        var users = await query
            .OrderBy(u => u.DisplayName)
            .Select(u => new
            {
                id = u.Id,
                tenant_id = u.TenantId,
                email = u.Email,
                display_name = u.DisplayName,
                role = u.Role,
                is_active = u.IsActive,
                last_login_at = u.LastLoginAt,
                invited_at = u.InvitedAt,
                invite_accepted_at = u.InviteAcceptedAt,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { tenant_id = tenantId, items = users, total = users.Count });
    }

    [HttpGet("users")]
    public async Task<IActionResult> SearchUsers(
        [FromQuery] string? q,
        [FromQuery] Guid? tenantId,
        [FromQuery] bool? isActive,
        [FromQuery] int limit = 100,
        [FromQuery] int offset = 0,
        CancellationToken cancellationToken = default)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        limit = Math.Clamp(limit, 1, 500);
        offset = Math.Max(0, offset);

        var query = _db.Users.AsNoTracking()
            .Include(u => u.Tenant)
            .Where(u => !u.IsDeleted);

        if (tenantId.HasValue)
            query = query.Where(u => u.TenantId == tenantId.Value);
        if (isActive.HasValue)
            query = query.Where(u => u.IsActive == isActive.Value);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.Email.ToLower().Contains(needle)
                || u.DisplayName.ToLower().Contains(needle)
                || (u.Tenant != null && u.Tenant.Name.ToLower().Contains(needle)));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(u => u.DisplayName)
            .Skip(offset)
            .Take(limit)
            .Select(u => new
            {
                id = u.Id,
                tenant_id = u.TenantId,
                tenant_name = u.Tenant != null ? u.Tenant.Name : null,
                email = u.Email,
                display_name = u.DisplayName,
                role = u.Role,
                is_active = u.IsActive,
                last_login_at = u.LastLoginAt,
                invited_at = u.InvitedAt,
                invite_accepted_at = u.InviteAcceptedAt,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { items, total, limit, offset });
    }

    [HttpPost("tenants/{tenantId:guid}/users/invite")]
    public async Task<IActionResult> InviteUser(
        Guid tenantId,
        [FromBody] PlatformInviteUserRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenantOk = await _db.Tenants.AnyAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (!tenantOk)
            return NotFound(new { detail = "tenant not found" });

        var role = NormalizeRole(body.Role);
        if (role is null)
            return BadRequest(new { detail = "Unsupported role." });

        var email = NormalizeEmail(body.Email);
        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { detail = "email is required" });

        var exists = await _db.Users.AnyAsync(
            u => u.TenantId == tenantId && u.Email.ToLower() == email,
            cancellationToken);
        if (exists)
            return Conflict(new { detail = "User already exists in this tenant." });

        var user = new User
        {
            TenantId = tenantId,
            Email = email,
            DisplayName = string.IsNullOrWhiteSpace(body.DisplayName)
                ? email.Split('@')[0]
                : body.DisplayName.Trim(),
            Role = role,
            InvitedAt = DateTime.UtcNow,
            IsActive = true,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(ToUserDto(user));
    }

    [HttpPut("tenants/{tenantId:guid}/users/{userId:guid}/role")]
    public async Task<IActionResult> UpdateRole(
        Guid tenantId,
        Guid userId,
        [FromBody] PlatformUpdateRoleRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var role = NormalizeRole(body.Role);
        if (role is null)
            return BadRequest(new { detail = "Unsupported role." });

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == userId && u.TenantId == tenantId && !u.IsDeleted,
            cancellationToken);
        if (user is null)
            return NotFound(new { detail = "user not found" });

        user.Role = role;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(ToUserDto(user));
    }

    [HttpPut("tenants/{tenantId:guid}/users/{userId:guid}/active")]
    public async Task<IActionResult> UpdateActive(
        Guid tenantId,
        Guid userId,
        [FromBody] PlatformUpdateActiveRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == userId && u.TenantId == tenantId && !u.IsDeleted,
            cancellationToken);
        if (user is null)
            return NotFound(new { detail = "user not found" });

        user.IsActive = body.IsActive;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(ToUserDto(user));
    }

    private static object ToUserDto(User u) => new
    {
        id = u.Id,
        tenant_id = u.TenantId,
        email = u.Email,
        display_name = u.DisplayName,
        role = u.Role,
        is_active = u.IsActive,
        last_login_at = u.LastLoginAt,
        invited_at = u.InvitedAt,
        invite_accepted_at = u.InviteAcceptedAt,
    };

    private static string NormalizeEmail(string value) => value.Trim().ToLowerInvariant();

    private static string? NormalizeRole(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : AllowedRoles.FirstOrDefault(r => string.Equals(r, value.Trim(), StringComparison.OrdinalIgnoreCase));
}

public sealed class PlatformPythonBootstrapRequest
{
    public string? BusinessName { get; set; }
    public string? BusinessType { get; set; }
    public string? SectorId { get; set; }
    public string? Location { get; set; }
    public string? Languages { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? InstagramHandle { get; set; }
    public bool? BootstrapSlots { get; set; }
    public bool? CreateBrandStub { get; set; }
}

public sealed class PlatformCreateWorkspaceRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsDefault { get; set; }
}

public sealed class PlatformInviteUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string Role { get; set; } = "Viewer";
}

public sealed class PlatformUpdateRoleRequest
{
    public string Role { get; set; } = "Viewer";
}

public sealed class PlatformUpdateActiveRequest
{
    public bool IsActive { get; set; }
}
