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

        var qs = HttpContext.Request.QueryString.HasValue
            ? HttpContext.Request.QueryString.Value
            : string.Empty;
        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/sectors{qs}",
            cancellationToken);
    }

    /// <summary>Create a canonical sector.</summary>
    [HttpPost("slot-catalog/sectors")]
    public async Task<IActionResult> CreateSector(CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        return await ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            "/api/v1/slot-catalog/sectors",
            cancellationToken,
            forwardBody: true);
    }

    /// <summary>Patch a canonical sector.</summary>
    [HttpPatch("slot-catalog/sectors/{sectorId}")]
    public async Task<IActionResult> PatchSector(
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
            HttpMethod.Patch,
            workspaceId,
            $"/api/v1/slot-catalog/sectors/{safe}",
            cancellationToken,
            forwardBody: true);
    }

    /// <summary>Slots for a sector (query: scope, workspace_id, include_archived).</summary>
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
        var qs = HttpContext.Request.QueryString.HasValue
            ? HttpContext.Request.QueryString.Value
            : string.Empty;
        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/sectors/{safe}/slots{qs}",
            cancellationToken);
    }

    /// <summary>Create a sector-global or brand-private catalog slot.</summary>
    [HttpPost("slot-catalog/slots")]
    public async Task<IActionResult> CreateSlot(CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        return await ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            "/api/v1/slot-catalog/slots",
            cancellationToken,
            forwardBody: true);
    }

    /// <summary>Get one catalog slot by key.</summary>
    [HttpGet("slot-catalog/slots/{slotKey}")]
    public async Task<IActionResult> GetSlot(
        string slotKey,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(slotKey);
        return await ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/slots/{safe}",
            cancellationToken);
    }

    /// <summary>Patch a catalog slot definition.</summary>
    [HttpPatch("slot-catalog/slots/{slotKey}")]
    public async Task<IActionResult> PatchSlot(
        string slotKey,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(slotKey);
        return await ProxyJsonAsync(
            HttpMethod.Patch,
            workspaceId,
            $"/api/v1/slot-catalog/slots/{safe}",
            cancellationToken,
            forwardBody: true);
    }

    /// <summary>Archive a catalog slot (soft remove from production defaults).</summary>
    [HttpPost("slot-catalog/slots/{slotKey}/archive")]
    public async Task<IActionResult> ArchiveSlot(
        string slotKey,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(slotKey);
        return await ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/slots/{safe}/archive",
            cancellationToken);
    }

    /// <summary>Re-activate an archived catalog slot.</summary>
    [HttpPost("slot-catalog/slots/{slotKey}/activate")]
    public async Task<IActionResult> ActivateSlot(
        string slotKey,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(slotKey);
        return await ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/slots/{safe}/activate",
            cancellationToken);
    }

    /// <summary>Clone a catalog slot under a new key (optionally brand-private).</summary>
    [HttpPost("slot-catalog/slots/{slotKey}/clone")]
    public async Task<IActionResult> CloneSlot(
        string slotKey,
        CancellationToken cancellationToken)
    {
        var denied = await EnsurePlatformAccessAsync(cancellationToken);
        if (denied is not null)
            return denied;

        var workspaceId = HttpContext.RequestServices
            .GetRequiredService<IRequestContext>().TenantId;
        if (workspaceId == Guid.Empty)
            return Unauthorized();

        var safe = Uri.EscapeDataString(slotKey);
        return await ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/slots/{safe}/clone",
            cancellationToken,
            forwardBody: true);
    }

    /// <summary>Create a brand-private custom slot and auto-assign it.</summary>
    [HttpPost("slot-catalog/tenants/{workspaceId:guid}/custom-slots")]
    public Task<IActionResult> CreateTenantCustomSlot(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/custom-slots",
            cancellationToken,
            forwardBody: true);

    /// <summary>Single sector detail.</summary>
    [HttpGet("slot-catalog/sectors/{sectorId}")]
    public async Task<IActionResult> GetSector(
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
            $"/api/v1/slot-catalog/sectors/{safe}",
            cancellationToken);
    }

    /// <summary>Sector slot coverage + brand count.</summary>
    [HttpGet("slot-catalog/sectors/{sectorId}/coverage")]
    public async Task<IActionResult> GetSectorCoverage(
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
            $"/api/v1/slot-catalog/sectors/{safe}/coverage",
            cancellationToken);
    }

    /// <summary>Cross-sector slot list (query: sector_id, scope, workspace_id).</summary>
    [HttpGet("slot-catalog/slots")]
    public async Task<IActionResult> ListSlots(CancellationToken cancellationToken)
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
            $"/api/v1/slot-catalog/slots{qs}",
            cancellationToken);
    }

    /// <summary>Fixed 7-shelf library legend.</summary>
    [HttpGet("slot-catalog/library-shelves")]
    public async Task<IActionResult> ListLibraryShelves(CancellationToken cancellationToken)
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
            "/api/v1/slot-catalog/library-shelves",
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

    [HttpGet("slot-catalog/tenants/{workspaceId:guid}/facilities")]
    public Task<IActionResult> GetFacilities(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/facilities",
            cancellationToken);

    [HttpPut("slot-catalog/tenants/{workspaceId:guid}/facilities")]
    public Task<IActionResult> PutFacilities(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/facilities",
            cancellationToken,
            forwardBody: true);

    [HttpGet("slot-catalog/tenants/{workspaceId:guid}/overview")]
    public Task<IActionResult> GetOverview(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/overview",
            cancellationToken);

    [HttpPost("slot-catalog/tenants/{workspaceId:guid}/preview")]
    public Task<IActionResult> Preview(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/preview",
            cancellationToken,
            forwardBody: true);

    [HttpPost("slot-catalog/tenants/{workspaceId:guid}/sync-facilities")]
    public Task<IActionResult> SyncFacilities(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/sync-facilities",
            cancellationToken);

    [HttpPost("slot-catalog/tenants/{workspaceId:guid}/reset-defaults")]
    public Task<IActionResult> ResetDefaults(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/slot-catalog/tenants/{workspaceId:D}/reset-defaults",
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

    [HttpGet("design-templates/{workspaceId:guid}/{templateId:guid}")]
    public Task<IActionResult> GetDesignTemplate(
        Guid workspaceId,
        Guid templateId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}/{templateId:D}",
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

    [HttpPost("design-templates/{workspaceId:guid}/bulk")]
    public Task<IActionResult> BulkDesignTemplates(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/design-templates/{workspaceId:D}/bulk",
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
