using Microsoft.AspNetCore.Mvc;
using Nexus.Api.Services;
using Nexus.Application.Services;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — AI / production cost ledger (Python /api/v1/cost-ledger proxy).
/// </summary>
[ApiController]
[Route("api/platform/cost-ledger")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformCostLedgerController : PlatformProxyControllerBase
{
    public PlatformCostLedgerController(
        IPlatformCrewClient crew,
        IPermissionService permissionService)
        : base(crew, permissionService)
    {
    }

    /// <summary>Workspace cost rollup.</summary>
    [HttpGet("{workspaceId:guid}/workspace/summary")]
    public Task<IActionResult> WorkspaceSummary(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/cost-ledger/{workspaceId:D}/workspace/summary",
            cancellationToken);

    /// <summary>Mission cost summary.</summary>
    [HttpGet("{workspaceId:guid}/missions/{missionId:guid}/summary")]
    public Task<IActionResult> MissionSummary(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/cost-ledger/{workspaceId:D}/missions/{missionId:D}/summary",
            cancellationToken);

    /// <summary>Mission production cost rollup.</summary>
    [HttpGet("{workspaceId:guid}/missions/{missionId:guid}/production")]
    public Task<IActionResult> MissionProduction(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/cost-ledger/{workspaceId:D}/missions/{missionId:D}/production",
            cancellationToken);

    /// <summary>Per-slot cost rollups.</summary>
    [HttpGet("{workspaceId:guid}/missions/{missionId:guid}/slots")]
    public Task<IActionResult> MissionSlots(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/cost-ledger/{workspaceId:D}/missions/{missionId:D}/slots",
            cancellationToken);

    /// <summary>Raw cost events for a mission.</summary>
    [HttpGet("{workspaceId:guid}/missions/{missionId:guid}/events")]
    public Task<IActionResult> MissionEvents(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/cost-ledger/{workspaceId:D}/missions/{missionId:D}/events",
            cancellationToken);
}
