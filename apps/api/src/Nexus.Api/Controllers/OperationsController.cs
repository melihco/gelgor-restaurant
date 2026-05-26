using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/operations")]
public class OperationsController : ControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;
    private readonly IAgentService _agentService;

    public OperationsController(
        NexusDbContext db,
        IRequestContext requestContext,
        IPermissionService permissionService,
        IAgentService agentService)
    {
        _db = db;
        _requestContext = requestContext;
        _permissionService = permissionService;
        _agentService = agentService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.OperationsView, cancellationToken))
            return Forbid();

        var since = DateTime.UtcNow.AddHours(-24);

        var agentRuns = await _db.AgentRuns
            .Include(run => run.Agent)
            .Include(run => run.Task)
            .Where(run => run.TenantId == _requestContext.TenantId)
            .OrderByDescending(run => run.StartedAt)
            .Take(60)
            .Select(run => new
            {
                run.Id,
                run.AgentId,
                AgentName = run.Agent != null ? run.Agent.DisplayName : string.Empty,
                AgentType = run.Agent != null ? run.Agent.AgentType.ToString() : string.Empty,
                TaskTitle = run.Task != null ? run.Task.Title : string.Empty,
                Status = run.Status.ToString(),
                run.StartedAt,
                run.CompletedAt,
                run.TokensUsed,
                run.ProviderModel,
                run.ErrorMessage,
                run.ExecutionLog
            })
            .ToListAsync(cancellationToken);

        var executionJobs = await _db.ExecutionJobs
            .Include(job => job.SuggestedAction)
            .Where(job => job.SuggestedAction != null && job.SuggestedAction.TenantId == _requestContext.TenantId)
            .OrderByDescending(job => job.StartedAt ?? job.CreatedAt)
            .Take(60)
            .Select(job => new
            {
                job.Id,
                job.SuggestedActionId,
                ActionType = job.SuggestedAction != null ? job.SuggestedAction.ActionType : string.Empty,
                Provider = job.SuggestedAction != null ? job.SuggestedAction.Provider.ToString() : string.Empty,
                Status = job.Status.ToString(),
                job.StartedAt,
                job.CompletedAt,
                job.Success,
                job.RetryCount,
                job.ErrorMessage,
                job.ProviderResponse,
                job.ResultData,
                job.AuditLog
            })
            .ToListAsync(cancellationToken);

        var auditLogs = await _db.AuditLogs
            .Where(log => log.TenantId == _requestContext.TenantId)
            .OrderByDescending(log => log.Timestamp)
            .Take(40)
            .Select(log => new
            {
                log.Id,
                log.Action,
                log.EntityType,
                log.EntityId,
                log.Timestamp,
                log.NewValues
            })
            .ToListAsync(cancellationToken);

        var recentAgentRuns = agentRuns.Select(run => new
        {
            run.Id,
            run.AgentId,
            agentName = string.IsNullOrWhiteSpace(run.AgentName) ? "Unknown agent" : run.AgentName,
            run.AgentType,
            taskTitle = run.TaskTitle,
            run.Status,
            run.StartedAt,
            run.CompletedAt,
            durationMs = DurationMs(run.StartedAt, run.CompletedAt),
            run.TokensUsed,
            run.ProviderModel,
            run.ErrorMessage,
            stage = ExtractJsonString(run.ExecutionLog, "stage"),
            summary = ExtractJsonString(run.ExecutionLog, "summary"),
            executionLog = string.IsNullOrWhiteSpace(run.ExecutionLog) ? "{}" : run.ExecutionLog
        }).ToList();

        var recentExecutionJobs = executionJobs.Select(job => new
        {
            job.Id,
            job.SuggestedActionId,
            job.ActionType,
            job.Provider,
            job.Status,
            job.StartedAt,
            job.CompletedAt,
            durationMs = job.StartedAt.HasValue ? DurationMs(job.StartedAt.Value, job.CompletedAt) : 0,
            job.Success,
            job.RetryCount,
            job.ErrorMessage,
            mode = ExtractJsonString(job.AuditLog, "mode"),
            providerStatus = ExtractJsonString(job.ProviderResponse, "status"),
            providerError = ExtractJsonString(job.ProviderResponse, "error"),
            auditLog = string.IsNullOrWhiteSpace(job.AuditLog) ? "{}" : job.AuditLog,
            providerResponseJson = string.IsNullOrWhiteSpace(job.ProviderResponse) ? "{}" : job.ProviderResponse,
            resultData = string.IsNullOrWhiteSpace(job.ResultData) ? "{}" : job.ResultData
        }).ToList();

        var failedRuns = recentAgentRuns
            .Where(run => run.Status == TaskStatus.Failed.ToString() || !string.IsNullOrWhiteSpace(run.ErrorMessage))
            .Take(8)
            .Select(run => new
            {
                source = "agent_run",
                id = run.Id,
                title = run.agentName,
                detail = string.IsNullOrWhiteSpace(run.ErrorMessage) ? run.summary : run.ErrorMessage,
                occurredAt = run.CompletedAt ?? run.StartedAt
            });

        var failedJobs = recentExecutionJobs
            .Where(job => job.Status == ExecutionJobStatus.Failed.ToString() || !job.Success)
            .Take(8)
            .Select(job => new
            {
                source = "provider_job",
                id = job.Id,
                title = $"{job.Provider} / {job.ActionType}",
                detail = FirstNonEmpty(job.providerError, job.ErrorMessage, job.providerStatus, "Provider execution failed."),
                occurredAt = job.CompletedAt ?? job.StartedAt ?? DateTime.UtcNow
            });

        var totalRuns24h = agentRuns.Count(run => run.StartedAt >= since);
        var failedRuns24h = agentRuns.Count(run =>
            run.StartedAt >= since &&
            (run.Status == TaskStatus.Failed.ToString() || !string.IsNullOrWhiteSpace(run.ErrorMessage)));
        var totalJobs24h = executionJobs.Count(job => (job.StartedAt ?? job.CompletedAt ?? DateTime.MinValue) >= since);
        var failedJobs24h = executionJobs.Count(job =>
            (job.StartedAt ?? job.CompletedAt ?? DateTime.MinValue) >= since &&
            (job.Status == ExecutionJobStatus.Failed.ToString() || !job.Success));

        var summary = new
        {
            generatedAt = DateTime.UtcNow,
            correlationId = HttpContext.Items.TryGetValue("CorrelationId", out var correlationId)
                ? correlationId?.ToString()
                : HttpContext.Response.Headers["X-Correlation-Id"].FirstOrDefault(),
            health = new
            {
                agentRuns24h = totalRuns24h,
                failedAgentRuns24h = failedRuns24h,
                executionJobs24h = totalJobs24h,
                failedExecutionJobs24h = failedJobs24h,
                providerFailureRate = totalJobs24h == 0 ? 0 : Math.Round((double)failedJobs24h / totalJobs24h * 100, 1),
                avgAgentRunDurationMs = AverageDuration(agentRuns.Select(run => DurationMs(run.StartedAt, run.CompletedAt))),
                avgExecutionDurationMs = AverageDuration(executionJobs.Select(job =>
                    job.StartedAt.HasValue ? DurationMs(job.StartedAt.Value, job.CompletedAt) : 0)),
                tokensUsed24h = agentRuns.Where(run => run.StartedAt >= since).Sum(run => run.TokensUsed)
            },
            recentAgentRuns,
            recentExecutionJobs,
            failures = failedRuns.Concat(failedJobs)
                .OrderByDescending(item => item.occurredAt)
                .Take(12),
            auditTrail = auditLogs
        };

        return Ok(summary);
    }

    /// <summary>
    /// Veritabanında hâlâ <c>InProgress</c> görünen ama süresi aşmış ajan çalıştırmalarını iptal eder (API/Crew çökmesi sonrası zombi kayıtlar).
    /// </summary>
    [HttpPost("reconcile-stale-agent-runs")]
    public async Task<IActionResult> ReconcileStaleAgentRuns(
        [FromQuery] int minAgeMinutes = 10,
        CancellationToken cancellationToken = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.OperationsView, cancellationToken))
            return Forbid();

        var minAge = Math.Clamp(minAgeMinutes, 5, 24 * 60);
        var threshold = DateTime.UtcNow.AddMinutes(-minAge);

        var stuck = await _db.AgentRuns
            .AsNoTracking()
            .Where(r =>
                r.TenantId == _requestContext.TenantId &&
                r.Status == TaskStatus.InProgress &&
                r.StartedAt < threshold)
            .Select(r => new { r.AgentId, r.Id })
            .ToListAsync(cancellationToken);

        var results = new List<object>();
        foreach (var row in stuck)
        {
            try
            {
                var dto = await _agentService.CancelStuckAgentExecutionAsync(
                    row.AgentId,
                    _requestContext.TenantId,
                    row.Id,
                    minAgeMinutes: 0,
                    force: true,
                    cancellationToken);
                results.Add(new
                {
                    agentRunId = row.Id,
                    cancelled = dto.Cancelled,
                    message = dto.Message
                });
            }
            catch (Exception ex)
            {
                results.Add(new
                {
                    agentRunId = row.Id,
                    cancelled = false,
                    error = ex.Message
                });
            }
        }

        return Ok(new { count = stuck.Count, results });
    }

    private static int DurationMs(DateTime startedAt, DateTime? completedAt)
    {
        var end = completedAt ?? DateTime.UtcNow;
        return Math.Max(0, (int)(end - startedAt).TotalMilliseconds);
    }

    private static int AverageDuration(IEnumerable<int> durations)
    {
        var values = durations.Where(value => value > 0).ToArray();
        return values.Length == 0 ? 0 : (int)values.Average();
    }

    private static string ExtractJsonString(string json, string key)
    {
        if (string.IsNullOrWhiteSpace(json))
            return string.Empty;

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(json);
            return document.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
                   document.RootElement.TryGetProperty(key, out var value)
                ? value.ValueKind switch
                {
                    System.Text.Json.JsonValueKind.String => value.GetString() ?? string.Empty,
                    System.Text.Json.JsonValueKind.Number => value.ToString(),
                    System.Text.Json.JsonValueKind.True => "true",
                    System.Text.Json.JsonValueKind.False => "false",
                    _ => string.Empty
                }
                : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
}
