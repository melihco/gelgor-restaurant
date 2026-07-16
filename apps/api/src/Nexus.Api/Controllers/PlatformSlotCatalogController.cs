using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Api.Services;
using Nexus.Application.Services;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — slot catalog + design templates (Python proxies).
/// </summary>
[ApiController]
[Route("api/platform")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformSlotCatalogController : PlatformProxyControllerBase
{
    public PlatformSlotCatalogController(
        IPlatformCrewClient crew,
        IPermissionService permissionService)
        : base(crew, permissionService)
    {
    }

    /// <summary>Canonical sectors for the production slot catalog.</summary>
    [HttpGet("slot-catalog/sectors")]
    public async Task<IActionResult> ListSectors(CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        // Sector list is not workspace-scoped; use caller tenant for X-Tenant-Id.
        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            "/api/v1/slot-catalog/sectors",
            cancellationToken);
    }

    /// <summary>Slots for a sector (optional query: format, tier).</summary>
    [HttpGet("slot-catalog/sectors/{sectorId}/slots")]
    public async Task<IActionResult> ListSectorSlots(
        string sectorId,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(sectorId);
        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/sectors/{safe}/slots",
            cancellationToken);
    }

    /// <summary>Tenant slot enable/priority assignments.</summary>
    [HttpGet("slot-catalog/tenants/{workspaceId:guid}/assignments")]
    public Task<IActionResult> GetAssignments(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/assignments",
            cancellationToken);

    /// <summary>Replace tenant slot assignments.</summary>
    [HttpPut("slot-catalog/tenants/{workspaceId:guid}/assignments")]
    public Task<IActionResult> PutAssignments(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/assignments",
            cancellationToken,
            forwardBody: true);

    /// <summary>Bootstrap default slot assignments for a tenant sector.</summary>
    [HttpPost("slot-catalog/tenants/{workspaceId:guid}/bootstrap")]
    public Task<IActionResult> Bootstrap(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/bootstrap",
            cancellationToken,
            forwardBody: true);

    /// <summary>List brand design templates (catalog-keyed library).</summary>
    [HttpGet("design-templates/{workspaceId:guid}")]
    public Task<IActionResult> ListDesignTemplates(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}",
            cancellationToken);

    /// <summary>Create a design template.</summary>
    [HttpPost("design-templates/{workspaceId:guid}")]
    public Task<IActionResult> CreateDesignTemplate(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}",
            cancellationToken,
            forwardBody: true);

    /// <summary>Patch a design template.</summary>
    [HttpPatch("design-templates/{workspaceId:guid}/{templateId:guid}")]
    public Task<IActionResult> PatchDesignTemplate(
        Guid workspaceId,
        Guid templateId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Patch,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}/{templateId:D}",
            cancellationToken,
            forwardBody: true);

    /// <summary>Delete a design template.</summary>
    [HttpDelete("design-templates/{workspaceId:guid}/{templateId:guid}")]
    public Task<IActionResult> DeleteDesignTemplate(
        Guid workspaceId,
        Guid templateId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Delete,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}/{templateId:D}",
            cancellationToken);
}
