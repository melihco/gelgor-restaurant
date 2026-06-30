using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Nexus.Application.Services;
using Nexus.Api.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// SuggestedAction yönetimi:
/// - Agent çalıştıktan sonra oluşan yapılandırılmış aksiyon önerilerini listele
/// - Onayla / Reddet
/// - Execute (gerçek provider'a gönder — şimdilik simülasyon)
///
/// Bu controller yalnızca HTTP/orkestrasyon yapar. Önizleme üretimi
/// <see cref="IActionPreviewBuilder"/>, kontrat/doğrulama ise
/// <see cref="IActionContractCatalog"/> servislerine devredilmiştir (SRP).
/// </summary>
[ApiController]
[Route("api/actions")]
public class ActionsController : ControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IBrandLearningService _brandLearningService;
    private readonly IRequestContext _requestContext;
    private readonly IActionProviderExecutor _actionProviderExecutor;
    private readonly IConfiguration _configuration;
    private readonly IPermissionService _permissionService;
    private readonly IUsageQuotaService _usageQuotaService;
    private readonly IActionPreviewBuilder _previewBuilder;
    private readonly IActionContractCatalog _contractCatalog;

    public ActionsController(
        NexusDbContext db,
        IBrandLearningService brandLearningService,
        IRequestContext requestContext,
        IActionProviderExecutor actionProviderExecutor,
        IConfiguration configuration,
        IPermissionService permissionService,
        IUsageQuotaService usageQuotaService,
        IActionPreviewBuilder previewBuilder,
        IActionContractCatalog contractCatalog)
    {
        _db = db;
        _brandLearningService = brandLearningService;
        _requestContext = requestContext;
        _actionProviderExecutor = actionProviderExecutor;
        _configuration = configuration;
        _permissionService = permissionService;
        _usageQuotaService = usageQuotaService;
        _previewBuilder = previewBuilder;
        _contractCatalog = contractCatalog;
    }

    // ── GET /api/actions ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetActions(
        [FromQuery] string? status = null,
        [FromQuery] string? provider = null,
        CancellationToken ct = default)
    {
        var query = _db.SuggestedActions
            .Include(a => a.Artifact)
            .Where(a => a.TenantId == _requestContext.TenantId)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<ActionStatus>(status, true, out var statusEnum))
            query = query.Where(a => a.Status == statusEnum);

        if (!string.IsNullOrEmpty(provider) && Enum.TryParse<IntegrationProvider>(provider, true, out var providerEnum))
            query = query.Where(a => a.Provider == providerEnum);

        var records = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(100)
            .Select(a => new
            {
                a.Id,
                a.ArtifactId,
                artifactTitle = a.Artifact != null ? a.Artifact.Title : string.Empty,
                a.ActionType,
                provider = a.Provider.ToString(),
                a.ApprovalRequired,
                status = a.Status.ToString(),
                payload = a.Payload,
                a.ApprovedAt,
                a.CreatedAt,
                a.UpdatedAt,
            })
            .ToListAsync(ct);

        var actions = new List<object>(records.Count);
        foreach (var item in records)
        {
            var preview = await _previewBuilder.BuildRenderedPreviewAsync(item.ActionType, item.payload, item.artifactTitle, ct);
            actions.Add(new
            {
                item.Id,
                item.ArtifactId,
                item.artifactTitle,
                item.ActionType,
                item.provider,
                item.ApprovalRequired,
                item.status,
                item.payload,
                item.ApprovedAt,
                item.CreatedAt,
                item.UpdatedAt,
                renderedPreview = preview
            });
        }

        return Ok(actions);
    }

    // ── GET /api/actions/{id} ────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetAction(Guid id, CancellationToken ct = default)
    {
        var action = await _db.SuggestedActions
            .Include(a => a.Artifact)
            .Include(a => a.IntegrationConnection)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);

        if (action == null) return NotFound();
        var preview = await _previewBuilder.BuildRenderedPreviewAsync(
            action.ActionType,
            action.Payload,
            action.Artifact?.Title ?? string.Empty,
            ct);

        return Ok(new
        {
            action.Id,
            action.ArtifactId,
            artifactTitle = action.Artifact?.Title ?? string.Empty,
            artifactContent = action.Artifact?.Content ?? string.Empty,
            action.ActionType,
            provider = action.Provider.ToString(),
            action.ApprovalRequired,
            status = action.Status.ToString(),
            payload = action.Payload,
            integrationConnectionId = action.IntegrationConnectionId,
            integrationName = action.IntegrationConnection?.DisplayName ?? string.Empty,
            action.TargetRef,
            action.ApprovedBy,
            action.ApprovedAt,
            action.CreatedAt,
            renderedPreview = preview
        });
    }

    [HttpGet("support-matrix")]
    public IActionResult GetSupportMatrix()
    {
        return Ok(_contractCatalog.GetSupportMatrix().Select(contract => new
        {
            actionType = contract.ActionType,
            label = contract.Label,
            provider = contract.Provider,
            liveSupported = contract.LiveSupported,
            requiredPayloadFields = contract.RequiredPayloadFields,
        }));
    }

    // ── POST /api/actions/{id}/approve ───────────────────────────────────
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> ApproveAction(Guid id, CancellationToken ct = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ActionsApprove, ct))
            return Forbid();

        var action = await _db.SuggestedActions
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);
        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Pending)
            return BadRequest(new { error = $"Action is already in '{action.Status}' state." });

        action.Status = ActionStatus.Approved;
        action.ApprovedAt = DateTime.UtcNow;
        action.ApprovedBy = _requestContext.UserId;
        action.UpdatedBy = _requestContext.UserId;
        AddAudit("approve", action, new { status = "Approved" });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id, status = "Approved" });
    }

    // ── POST /api/actions/{id}/reject ────────────────────────────────────
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> RejectAction(
        Guid id,
        [FromBody] RejectActionRequest? request = null,
        CancellationToken ct = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ActionsReject, ct))
            return Forbid();

        var action = await _db.SuggestedActions
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);
        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Pending)
            return BadRequest(new { error = $"Action is already in '{action.Status}' state." });

        action.Status = ActionStatus.Rejected;
        action.UpdatedBy = _requestContext.UserId;
        AddAudit("reject", action, new { status = "Rejected", request?.Reason });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id, status = "Rejected" });
    }

    // ── POST /api/actions/{id}/execute ───────────────────────────────────
    /// <summary>
    /// Onaylanmış aksiyonu gerçek provider'a uygula.
    /// Faz 3'e kadar simülasyon modunda çalışır — payload'u loglar, ExecutionJob oluşturur.
    /// </summary>
    [HttpPost("{id:guid}/execute")]
    public async Task<IActionResult> ExecuteAction(
        Guid id,
        [FromQuery] string? mode = null,
        CancellationToken ct = default)
    {
        var action = await _db.SuggestedActions
            .Include(a => a.IntegrationConnection)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);

        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Approved &&
            !(action.Status == ActionStatus.Pending && !action.ApprovalRequired))
        {
            return BadRequest(new { error = "Action must be Approved before execution." });
        }

        var validation = _contractCatalog.ValidatePayload(action.ActionType, action.Provider, action.Payload);
        if (!validation.Success)
        {
            return BadRequest(new
            {
                error = validation.Message,
                actionType = action.ActionType,
                provider = action.Provider.ToString()
            });
        }

        var executionMode = string.IsNullOrWhiteSpace(mode)
            ? _configuration["ActionExecution:Mode"] ?? "dry-run"
            : mode;
        var isLive = executionMode.Trim().Equals("live", StringComparison.OrdinalIgnoreCase);
        if (isLive && !_contractCatalog.IsLiveSupported(action.ActionType))
        {
            return BadRequest(new
            {
                error = "live_adapter_not_implemented",
                action.ActionType,
                provider = action.Provider.ToString(),
                message = "This action type is not enabled for live execution yet. Use dry-run or choose a supported action."
            });
        }

        var requiredPermission = isLive
            ? Permissions.ProviderExecuteLive
            : Permissions.ProviderExecuteDryRun;
        if (!await _permissionService.HasPermissionAsync(requiredPermission, ct))
            return Forbid();

        if (isLive)
        {
            var liveQuota = await _usageQuotaService.EnsureLiveProviderActionAllowedAsync(_requestContext.TenantId, ct);
            if (!liveQuota.Allowed)
                return StatusCode(StatusCodes.Status402PaymentRequired, liveQuota);
        }

        var quota = await _usageQuotaService.EnsureProviderActionAllowedAsync(_requestContext.TenantId, ct);
        if (!quota.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, quota);

        // ExecutionJob oluştur
        var job = new Nexus.Domain.Entities.ExecutionJob
        {
            SuggestedActionId = action.Id,
            Status = Nexus.Domain.Enums.ExecutionJobStatus.Running,
            StartedAt = DateTime.UtcNow,
        };
        _db.ExecutionJobs.Add(job);

        var executionResult = await _actionProviderExecutor.ExecuteAsync(action, executionMode, ct);

        job.Status = executionResult.Success
            ? Nexus.Domain.Enums.ExecutionJobStatus.Completed
            : Nexus.Domain.Enums.ExecutionJobStatus.Failed;
        job.CompletedAt = DateTime.UtcNow;
        job.Success = executionResult.Success;
        job.ProviderResponse = JsonSerializer.Serialize(executionResult.ProviderResponse);
        job.ResultData = JsonSerializer.Serialize(executionResult.ResultData);
        job.AuditLog = JsonSerializer.Serialize(new
        {
            executedAt = DateTime.UtcNow,
            actionType = action.ActionType,
            provider = action.Provider.ToString(),
            mode = executionResult.Mode,
        });

        action.Status = executionResult.Success ? ActionStatus.Executed : ActionStatus.Failed;
        if (executionResult.Success && action.ApprovedAt == null)
        {
            action.ApprovedAt = DateTime.UtcNow;
            action.ApprovedBy = _requestContext.UserId;
        }
        action.UpdatedBy = _requestContext.UserId;

        if (executionResult.Success)
        {
            await _brandLearningService.RecordExecutedActionAsync(
                action,
                executionResult.Message,
                _requestContext.UserId,
                ct);
        }
        AddAudit("execute", action, new
        {
            status = action.Status.ToString(),
            executionResult.Mode,
            executionResult.Success,
            executionResult.Message
        });

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            jobId = job.Id,
            actionId = id,
            success = executionResult.Success,
            status = action.Status.ToString(),
            mode = executionResult.Mode,
            message = executionResult.Message,
            providerResponse = executionResult.ProviderResponse,
        });
    }

    private void AddAudit(string operation, SuggestedAction action, object newValues)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = _requestContext.TenantId,
            UserId = _requestContext.UserId,
            Action = $"suggested_action.{operation}",
            EntityType = nameof(SuggestedAction),
            EntityId = action.Id,
            OldValues = "{}",
            NewValues = JsonSerializer.Serialize(newValues),
            CreatedBy = _requestContext.UserId,
            UpdatedBy = _requestContext.UserId
        });
    }
}

public record RejectActionRequest(string? Reason = null);
