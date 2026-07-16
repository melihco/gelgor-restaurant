using Microsoft.AspNetCore.Mvc;
using Nexus.Api.Services;
using Nexus.Application.Services;

namespace Nexus.Api.Controllers;

/// <summary>
/// Super Admin — brand context (Python /api/v1/brand-context proxy).
/// Deeper than Nexus /api/brand-context (assets-only).
/// </summary>
[ApiController]
[Route("api/platform/brand-context")]
[Tags("Platform")]
[Produces("application/json")]
public sealed class PlatformBrandContextController : PlatformProxyControllerBase
{
    public PlatformBrandContextController(
        IPlatformCrewClient crew,
        IPermissionService permissionService)
        : base(crew, permissionService)
    {
    }

    /// <summary>Full brand context record.</summary>
    [HttpGet("{workspaceId:guid}")]
    public Task<IActionResult> Get(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}",
            cancellationToken);

    /// <summary>Normalized brand intelligence snapshot.</summary>
    [HttpGet("{workspaceId:guid}/snapshot")]
    public Task<IActionResult> GetSnapshot(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/snapshot",
            cancellationToken);

    /// <summary>Patch brand context fields.</summary>
    [HttpPatch("{workspaceId:guid}")]
    public Task<IActionResult> Patch(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Patch,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}",
            cancellationToken,
            forwardBody: true);

    /// <summary>Run brand analyze (Apify/website/etc.).</summary>
    [HttpPost("{workspaceId:guid}/analyze")]
    public Task<IActionResult> Analyze(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/analyze",
            cancellationToken,
            forwardBody: true);

    /// <summary>Complete brand gaps via AI.</summary>
    [HttpPost("{workspaceId:guid}/complete-gaps")]
    public Task<IActionResult> CompleteGaps(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/complete-gaps",
            cancellationToken,
            forwardBody: true);

    /// <summary>Confirm brand constitution.</summary>
    [HttpPost("{workspaceId:guid}/confirm-constitution")]
    public Task<IActionResult> ConfirmConstitution(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Post,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/confirm-constitution",
            cancellationToken,
            forwardBody: true);

    [HttpGet("{workspaceId:guid}/theme")]
    public Task<IActionResult> GetTheme(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/theme",
            cancellationToken);

    [HttpPut("{workspaceId:guid}/theme")]
    public Task<IActionResult> PutTheme(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/theme",
            cancellationToken,
            forwardBody: true);

    [HttpGet("{workspaceId:guid}/vibe")]
    public Task<IActionResult> GetVibe(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/vibe",
            cancellationToken);

    [HttpPut("{workspaceId:guid}/vibe")]
    public Task<IActionResult> PutVibe(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Put,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/vibe",
            cancellationToken,
            forwardBody: true);

    [HttpGet("{workspaceId:guid}/gallery-analysis")]
    public Task<IActionResult> GetGalleryAnalysis(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/gallery-analysis",
            cancellationToken);

    [HttpGet("{workspaceId:guid}/brand-gaps")]
    public Task<IActionResult> GetBrandGaps(
        Guid workspaceId,
        CancellationToken cancellationToken)
        => ProxyJsonAsync(
            HttpMethod.Get,
            workspaceId,
            $"/api/v1/brand-context/{workspaceId:D}/brand-gaps",
            cancellationToken);
}
