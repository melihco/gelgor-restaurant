using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Api.Hubs;
using Nexus.Api.Services;
using Nexus.Contracts.Dtos;
using Nexus.Contracts.Events;
using Nexus.Domain.Enums;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;
using System.Text.Json;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArtifactsController : ControllerBase
{
    private readonly IArtifactService _artifactService;
    private readonly IReviewService _reviewService;
    private readonly IHubContext<OfficeHub, IOfficeHubClient> _hubContext;
    private readonly NexusDbContext _db;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;

    public ArtifactsController(
        IArtifactService artifactService,
        IReviewService reviewService,
        IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        NexusDbContext db,
        IRequestContext requestContext,
        IPermissionService permissionService)
    {
        _artifactService = artifactService;
        _reviewService = reviewService;
        _hubContext = hubContext;
        _db = db;
        _requestContext = requestContext;
        _permissionService = permissionService;
    }

    // ── Helper: get or auto-create a default task for the tenant ──────────
    private async Task<Guid> GetOrCreateDefaultTaskIdAsync(CancellationToken ct)
    {
        var taskId = await _db.TaskItems
            .Where(t => t.TenantId == _requestContext.TenantId && !t.IsDeleted)
            .Select(t => t.Id)
            .FirstOrDefaultAsync(ct);

        if (taskId != Guid.Empty) return taskId;

        // No task exists — create a default Brief + TaskItem so artifacts can be saved
        var userId = _requestContext.UserId == Guid.Empty
            ? Guid.Parse("00000000-0000-0000-0000-000000000001")
            : _requestContext.UserId;
        var brief = new Brief
        {
            TenantId        = _requestContext.TenantId,
            CreatedByUserId = userId,
            Title           = "AI İçerik Üretimi",
            Description     = "Otomatik oluşturulan varsayılan brief.",
            RawContent      = "{}",
            Status          = BriefStatus.Draft,
        };
        _db.Briefs.Add(brief);
        await _db.SaveChangesAsync(ct);

        var task = new TaskItem
        {
            TenantId    = _requestContext.TenantId,
            BriefId     = brief.Id,
            Title       = "İçerik Üretimi",
            Description = "AI tarafından üretilen içerikler için varsayılan görev.",
            AgentType   = AgentType.SocialMediaDesigner,
            Status      = Nexus.Domain.Enums.TaskStatus.Pending,
            Priority    = TaskPriority.Normal,
        };
        _db.TaskItems.Add(task);
        await _db.SaveChangesAsync(ct);

        return task.Id;
    }

    // ── POST /api/artifacts/video ──────────────────────────────────────────
    /// <summary>
    /// Saves a Runway-generated video as an OutputArtifact so it appears
    /// in the UI (Outputs page, Approvals, Content page).
    /// Called internally by the Next.js /api/generate-reel endpoint.
    /// </summary>
    [HttpPost("video")]
    public async Task<IActionResult> SaveVideoArtifact(
        [FromBody] VideoArtifactRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ContentUrl))
            return BadRequest(new { error = "contentUrl is required" });
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { error = "title is required" });

        var taskId = await GetOrCreateDefaultTaskIdAsync(ct);

        var metadata = request.Metadata != null
            ? JsonSerializer.Serialize(request.Metadata)
            : JsonSerializer.Serialize(new { source = "runway" });

        var artifact = new OutputArtifact
        {
            TenantId = _requestContext.TenantId,
            TaskId = taskId,
            ArtifactType = ArtifactType.VideoEdit,
            Title = request.Title,
            Content = request.Content ?? request.Title,
            ContentUrl = request.ContentUrl,
            Metadata = metadata,
            ReviewStatus = ReviewStatus.Pending,
            CreatedBy = _requestContext.UserId,
            UpdatedBy = _requestContext.UserId,
        };

        _db.OutputArtifacts.Add(artifact);
        await _db.SaveChangesAsync(ct);

        // Notify dashboard via SignalR
        await _hubContext.NotifyNewNotification(
            _requestContext.TenantId,
            _requestContext.OfficeId,
            new NewNotificationEvent
            {
                NotificationId = Guid.NewGuid(),
                Type = NotificationType.TaskCompleted,
                Title = "Reel hazır",
                Message = $"'{request.Title}' videosu oluşturuldu, onay bekliyor.",
                CreatedAt = DateTime.UtcNow
            });

        return Ok(new
        {
            id = artifact.Id,
            title = artifact.Title,
            contentUrl = artifact.ContentUrl,
            artifactType = artifact.ArtifactType.ToString(),
            reviewStatus = artifact.ReviewStatus.ToString(),
            createdAt = artifact.CreatedAt,
        });
    }

    // ── POST /api/artifacts/creative ────────────────────────────────────────
    /// <summary>
    /// Saves a generated image/social creative as an OutputArtifact so it can be
    /// previewed in Outputs and approved before publishing.
    /// </summary>
    [HttpPost("creative")]
    public async Task<IActionResult> SaveCreativeArtifact(
        [FromBody] CreativeArtifactRequest request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ContentUrl))
            return BadRequest(new { error = "contentUrl is required" });
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { error = "title is required" });

        var taskId = await GetOrCreateDefaultTaskIdAsync(ct);

        var metadata = request.Metadata != null
            ? JsonSerializer.Serialize(request.Metadata)
            : JsonSerializer.Serialize(new { source = "openai-image", platform = request.Platform, contentType = request.ContentType });

        var artifact = new OutputArtifact
        {
            TenantId = _requestContext.TenantId,
            TaskId = taskId,
            ArtifactType = ArtifactType.SocialMediaGraphic,
            Title = request.Title,
            Content = request.Content ?? request.Title,
            ContentUrl = request.ContentUrl,
            Metadata = metadata,
            ReviewStatus = ReviewStatus.Pending,
            CreatedBy = _requestContext.UserId,
            UpdatedBy = _requestContext.UserId,
        };

        _db.OutputArtifacts.Add(artifact);
        await _db.SaveChangesAsync(ct);

        await _hubContext.NotifyNewNotification(
            _requestContext.TenantId,
            _requestContext.OfficeId,
            new NewNotificationEvent
            {
                NotificationId = Guid.NewGuid(),
                Type = NotificationType.TaskCompleted,
                Title = "Creative hazır",
                Message = $"'{request.Title}' görseli oluşturuldu, onay bekliyor.",
                CreatedAt = DateTime.UtcNow
            });

        return Ok(new
        {
            id = artifact.Id,
            title = artifact.Title,
            contentUrl = artifact.ContentUrl,
            artifactType = artifact.ArtifactType.ToString(),
            reviewStatus = artifact.ReviewStatus.ToString(),
            createdAt = artifact.CreatedAt,
        });
    }

    // ── GET /api/artifacts ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<ActionResult<List<ArtifactDto>>> GetArtifacts([FromQuery] Guid? agentRunId, CancellationToken cancellationToken)
    {
        var artifacts = await _artifactService.GetArtifactsAsync(_requestContext.TenantId, agentRunId, cancellationToken);
        return Ok(artifacts);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ArtifactDto>> GetArtifact(Guid id, CancellationToken cancellationToken)
    {
        if (!await ArtifactBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        var artifact = await _artifactService.GetArtifactByIdAsync(id, cancellationToken);
        if (artifact == null)
        {
            return NotFound();
        }

        return Ok(artifact);
    }

    [HttpPost("{id}/approve")]
    public async Task<ActionResult<ReviewDecisionDto>> ApproveArtifact(Guid id, [FromBody] ArtifactCommentRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        if (!await ArtifactBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        var decision = await _reviewService.ApproveArtifactAsync(
            id,
            _requestContext.UserId,
            request.Comments ?? string.Empty,
            request.FinalizedContent,
            cancellationToken);
        var artifact = await _artifactService.GetArtifactByIdAsync(id, cancellationToken);
        if (artifact != null)
        {
            await _hubContext.NotifyNewNotification(
                _requestContext.TenantId,
                _requestContext.OfficeId,
                new NewNotificationEvent
                {
                    NotificationId = Guid.NewGuid(),
                    Type = NotificationType.ApprovalDecision,
                    Title = "Artifact approved",
                    Message = $"{artifact.Title} approved",
                    CreatedAt = DateTime.UtcNow
                });
        }
        return Ok(decision);
    }

    [HttpPost("{id}/reject")]
    public async Task<ActionResult<ReviewDecisionDto>> RejectArtifact(Guid id, [FromBody] ArtifactRejectRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        if (!await ArtifactBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        var reasonBlock = string.IsNullOrWhiteSpace(request.ReasonCategory)
            ? string.Empty
            : $"ReasonCategory: {request.ReasonCategory}\n";
        var decision = await _reviewService.RejectArtifactAsync(
            id,
            _requestContext.UserId,
            $"{reasonBlock}{request.Comments ?? string.Empty}".Trim(),
            cancellationToken);
        var artifact = await _artifactService.GetArtifactByIdAsync(id, cancellationToken);
        if (artifact != null)
        {
            await _hubContext.NotifyNewNotification(
                _requestContext.TenantId,
                _requestContext.OfficeId,
                new NewNotificationEvent
                {
                    NotificationId = Guid.NewGuid(),
                    Type = NotificationType.ApprovalDecision,
                    Title = "Artifact rejected",
                    Message = $"{artifact.Title} sent back for revision",
                    CreatedAt = DateTime.UtcNow
                });
        }
        return Ok(decision);
    }

    [HttpPost("{id}/request-revision")]
    public async Task<ActionResult<ReviewDecisionDto>> RequestRevision(Guid id, [FromBody] ArtifactRevisionRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        if (!await ArtifactBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        var decision = await _reviewService.RequestRevisionAsync(id, _requestContext.UserId, request.RequestedChanges, cancellationToken);
        var artifact = await _artifactService.GetArtifactByIdAsync(id, cancellationToken);
        if (artifact != null)
        {
            await _hubContext.NotifyNewNotification(
                _requestContext.TenantId,
                _requestContext.OfficeId,
                new NewNotificationEvent
                {
                    NotificationId = Guid.NewGuid(),
                    Type = NotificationType.ApprovalDecision,
                    Title = "Revision requested",
                    Message = $"{artifact.Title} requires updates",
                    CreatedAt = DateTime.UtcNow
                });
        }
        return Ok(decision);
    }

    // ── PATCH /api/artifacts/{id}/attach-image ─────────────────────────────
    /// <summary>
    /// Attaches a generated image URL to an existing artifact.
    /// Updates ContentUrl and injects imageUrl into the Content JSON.
    /// </summary>
    [HttpPatch("{id}/attach-image")]
    public async Task<IActionResult> AttachImage(Guid id, [FromBody] AttachImageRequest request, CancellationToken ct)
    {
        if (!await ArtifactBelongsToTenantAsync(id, ct))
            return NotFound();

        var artifact = await _db.OutputArtifacts.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (artifact == null) return NotFound();

        // Update ContentUrl
        artifact.ContentUrl = request.ImageUrl;

        // Merge imageUrl into existing Content JSON
        var contentObj = new System.Text.Json.Nodes.JsonObject();
        try
        {
            var parsed = System.Text.Json.Nodes.JsonNode.Parse(artifact.Content ?? "{}");
            if (parsed is System.Text.Json.Nodes.JsonObject obj)
                contentObj = obj;
        }
        catch { /* start fresh */ }

        contentObj["imageUrl"] = request.ImageUrl;
        if (!string.IsNullOrWhiteSpace(request.ContentType))
            contentObj["kind"] = request.ContentType;

        artifact.Content = contentObj.ToJsonString();
        artifact.UpdatedBy = _requestContext.UserId;

        await _db.SaveChangesAsync(ct);

        return Ok(new { id = artifact.Id, contentUrl = artifact.ContentUrl });
    }

    private Task<bool> ArtifactBelongsToTenantAsync(Guid artifactId, CancellationToken cancellationToken)
    {
        return _db.OutputArtifacts.AnyAsync(
            artifact => artifact.Id == artifactId && artifact.TenantId == _requestContext.TenantId,
            cancellationToken);
    }
}

public record ArtifactCommentRequest(string? Comments, string? FinalizedContent);
public record ArtifactRejectRequest(string? Comments, string? ReasonCategory);
public record ArtifactRevisionRequest(string RequestedChanges);
public record AttachImageRequest(string ImageUrl, string? ContentType);

public class VideoArtifactRequest
{
    public string Title { get; set; } = string.Empty;
    /// <summary>CDN URL of the generated mp4 from Runway</summary>
    public string ContentUrl { get; set; } = string.Empty;
    /// <summary>Prompt or caption text</summary>
    public string? Content { get; set; }
    /// <summary>Optional metadata (runwayTaskId, model, duration, ratio)</summary>
    public Dictionary<string, object>? Metadata { get; set; }
}

public class CreativeArtifactRequest
{
    public string Title { get; set; } = string.Empty;
    /// <summary>CDN URL of the generated image</summary>
    public string ContentUrl { get; set; } = string.Empty;
    /// <summary>Caption, prompt or summary text</summary>
    public string? Content { get; set; }
    public string Platform { get; set; } = "instagram";
    public string ContentType { get; set; } = "post";
    public Dictionary<string, object>? Metadata { get; set; }
}
