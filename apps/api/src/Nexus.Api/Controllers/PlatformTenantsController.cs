using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — cross-tenant registry (Nexus SSOT) + Python mirror suspend helpers.
/// </summary>
[ApiController]
[Route("api/platform")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformTenantsController : PlatformProxyControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IPackageService _packageService;

    public PlatformTenantsController(
        IPlatformCrewClient crew,
        IPermissionService permissionService,
        NexusDbContext db,
        IPackageService packageService)
        : base(crew, permissionService)
    {
        _db = db;
        _packageService = packageService;
    }

    /// <summary>List Nexus tenants for brand/sector admin pickers.</summary>
    [HttpGet("tenants")]
    public async Task<IActionResult> ListTenants(
        [FromQuery] string? q,
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

        var query = _db.Tenants.AsNoTracking()
            .Include(t => t.CompanyProfile)
            .Where(t => !t.IsDeleted);

        if (isActive.HasValue)
            query = query.Where(t => t.IsActive == isActive.Value);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim().ToLowerInvariant();
            query = query.Where(t =>
                t.Name.ToLower().Contains(needle)
                || t.Slug.ToLower().Contains(needle)
                || (t.CompanyProfile != null && t.CompanyProfile.Industry.ToLower().Contains(needle)));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(t => t.Name)
            .Skip(offset)
            .Take(limit)
            .Select(t => new
            {
                id = t.Id,
                name = t.Name,
                slug = t.Slug,
                plan = t.Plan,
                is_active = t.IsActive,
                logo_url = t.LogoUrl,
                industry = t.CompanyProfile != null ? t.CompanyProfile.Industry : null,
                created_at = t.CreatedAt,
                updated_at = t.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return Ok(new { items, total, limit, offset });
    }

    /// <summary>Single Nexus tenant detail.</summary>
    [HttpGet("tenants/{tenantId:guid}")]
    public async Task<IActionResult> GetTenant(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants.AsNoTracking()
            .Include(t => t.CompanyProfile)
            .Where(t => t.Id == tenantId && !t.IsDeleted)
            .Select(t => new
            {
                id = t.Id,
                name = t.Name,
                slug = t.Slug,
                plan = t.Plan,
                is_active = t.IsActive,
                logo_url = t.LogoUrl,
                settings = t.Settings,
                industry = t.CompanyProfile != null ? t.CompanyProfile.Industry : null,
                created_at = t.CreatedAt,
                updated_at = t.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        return Ok(tenant);
    }

    /// <summary>Patch Nexus tenant name/plan/active.</summary>
    [HttpPatch("tenants/{tenantId:guid}")]
    public async Task<IActionResult> PatchTenant(
        Guid tenantId,
        [FromBody] PlatformTenantPatchRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants
            .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        if (!string.IsNullOrWhiteSpace(body.Name))
            tenant.Name = body.Name.Trim();
        if (!string.IsNullOrWhiteSpace(body.Plan))
            tenant.Plan = body.Plan.Trim();
        if (body.IsActive.HasValue)
            tenant.IsActive = body.IsActive.Value;
        if (body.LogoUrl is not null)
            tenant.LogoUrl = body.LogoUrl;

        tenant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        // Python mirror sync is best-effort via suspend/reactivate endpoints.
        return Ok(new
        {
            id = tenant.Id,
            name = tenant.Name,
            slug = tenant.Slug,
            plan = tenant.Plan,
            is_active = tenant.IsActive,
            logo_url = tenant.LogoUrl,
        });
    }

    /// <summary>
    /// CRM billing — assign package subscription for a tenant (cross-tenant).
    /// </summary>
    [HttpPut("tenants/{tenantId:guid}/subscription")]
    public async Task<IActionResult> PutTenantSubscription(
        Guid tenantId,
        [FromBody] SelectPackageRequest body,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants
            .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        var subscription = await _packageService.SelectPackageAsync(tenantId, body, cancellationToken);

        var packageName = await _db.PackageDefinitions.AsNoTracking()
            .Where(p => p.Id == body.PackageId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(packageName))
        {
            tenant.Plan = packageName;
            tenant.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return Ok(new
        {
            tenant_id = tenantId,
            plan = tenant.Plan,
            subscription,
        });
    }

    [HttpPost("tenants/{tenantId:guid}/suspend")]
    public async Task<IActionResult> SuspendTenant(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants
            .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        tenant.IsActive = false;
        tenant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _ = await ProxyJsonAsync(
            HttpMethod.Post,
            tenantId,
            $"/api/v1/tenants/{tenantId:D}/suspend",
            cancellationToken);

        return Ok(new { id = tenant.Id, is_active = tenant.IsActive });
    }

    [HttpPost("tenants/{tenantId:guid}/reactivate")]
    public async Task<IActionResult> ReactivateTenant(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var tenant = await _db.Tenants
            .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);
        if (tenant is null)
            return NotFound(new { detail = "tenant not found" });

        tenant.IsActive = true;
        tenant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _ = await ProxyJsonAsync(
            HttpMethod.Post,
            tenantId,
            $"/api/v1/tenants/{tenantId:D}/reactivate",
            cancellationToken);

        return Ok(new { id = tenant.Id, is_active = tenant.IsActive });
    }

    /// <summary>Python brand_contexts registry (intelligence side).</summary>
    [HttpGet("brands")]
    public async Task<IActionResult> ListBrands(CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var qs = HttpContext.Request.QueryString.HasValue
            ? HttpContext.Request.QueryString.Value
            : string.Empty;
        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/platform/brands{qs}",
            cancellationToken);
    }

    [HttpGet("brands/{workspaceId:guid}")]
    public Task<IActionResult> GetBrand(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/platform/brands/{workspaceId:D}",
            cancellationToken);

    [HttpGet("brands-by-sector")]
    public async Task<IActionResult> BrandsBySector(CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            "/api/v1/platform/brands-by-sector",
            cancellationToken);
    }
}

public sealed class PlatformTenantPatchRequest
{
    public string? Name { get; set; }
    public string? Plan { get; set; }
    public bool? IsActive { get; set; }
    public string? LogoUrl { get; set; }
}
