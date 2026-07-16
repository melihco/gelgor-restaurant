using Microsoft.AspNetCore.Mvc;
using Nexus.Api.Services;
using Nexus.Application.Services;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — mission &amp; production ops (Python /api/v1/missions proxy).
/// Path workspaceId is the target brand tenant (cross-tenant allowed for platform.operate).
/// </summary>
[ApiController]
[Route("api/platform/missions")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformMissionsController : PlatformProxyControllerBase
{
    public PlatformMissionsController(
        IPlatformCrewClient crew,
        IPermissionService permissionService)
        : base(crew, permissionService)
    {
    }

    /// <summary>List missions for a workspace.</summary>
    [HttpGet("{workspaceId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public Task<IActionResult> List(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}",
            cancellationToken);

    /// <summary>Mission detail (plan, status, artifacts summary).</summary>
    [HttpGet("{workspaceId:guid}/{missionId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public Task<IActionResult> GetDetail(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}",
            cancellationToken);

    /// <summary>Mission progress / production rollup.</summary>
    [HttpGet("{workspaceId:guid}/{missionId:guid}/progress")]
    public Task<IActionResult> GetProgress(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/progress",
            cancellationToken);

    /// <summary>Factory production_jobs for a mission.</summary>
    [HttpGet("{workspaceId:guid}/{missionId:guid}/production-jobs")]
    public Task<IActionResult> GetProductionJobs(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/production-jobs",
            cancellationToken);

    /// <summary>Propose new missions for the workspace.</summary>
    [HttpPost("{workspaceId:guid}/propose")]
    public Task<IActionResult> Propose(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/propose",
            cancellationToken,
            forwardBody: true);

    [HttpPut("{workspaceId:guid}/{missionId:guid}/approve")]
    public Task<IActionResult> Approve(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/approve",
            cancellationToken,
            forwardBody: true);

    [HttpPut("{workspaceId:guid}/{missionId:guid}/reject")]
    public Task<IActionResult> Reject(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/reject",
            cancellationToken,
            forwardBody: true);

    [HttpPut("{workspaceId:guid}/{missionId:guid}/cancel")]
    public Task<IActionResult> Cancel(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/cancel",
            cancellationToken,
            forwardBody: true);

    [HttpPut("{workspaceId:guid}/{missionId:guid}/restart")]
    public Task<IActionResult> Restart(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/restart",
            cancellationToken,
            forwardBody: true);

    /// <summary>Kick / resume feed production drain for a mission.</summary>
    [HttpPut("{workspaceId:guid}/{missionId:guid}/kick-feed-production")]
    public Task<IActionResult> KickFeedProduction(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/kick-feed-production",
            cancellationToken,
            forwardBody: true);

    /// <summary>Re-run feed production for an approved mission.</summary>
    [HttpPut("{workspaceId:guid}/{missionId:guid}/reproduce-feed")]
    public Task<IActionResult> ReproduceFeed(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/reproduce-feed",
            cancellationToken,
            forwardBody: true);

    /// <summary>Reset production state (clears factory jobs for re-drain).</summary>
    [HttpPost("{workspaceId:guid}/{missionId:guid}/reset-production")]
    public Task<IActionResult> ResetProduction(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/reset-production",
            cancellationToken,
            forwardBody: true);

    /// <summary>Requeue failed/pending factory jobs.</summary>
    [HttpPost("{workspaceId:guid}/{missionId:guid}/requeue-factory-jobs")]
    public Task<IActionResult> RequeueFactoryJobs(
        Guid workspaceId,
        Guid missionId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/missions/{workspaceId:D}/{missionId:D}/requeue-factory-jobs",
            cancellationToken,
            forwardBody: true);
}
