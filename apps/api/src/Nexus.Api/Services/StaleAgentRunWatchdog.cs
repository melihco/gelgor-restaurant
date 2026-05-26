using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Infrastructure.Data;
using AgentTaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Api.Services;

/// <summary>
/// InProgress kayıtları HTTP/Crew zaman aşımı veya API kapanması sonrası bazen DB’de kalır.
/// Eşik aşıldığında otomatik iptal eder (force).
/// </summary>
public sealed class StaleAgentRunWatchdog : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<StaleAgentRunWatchdog> _logger;

    public StaleAgentRunWatchdog(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<StaleAgentRunWatchdog> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("AgentRunWatchdog:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("StaleAgentRunWatchdog disabled via configuration.");
            return;
        }

        var intervalSec = Math.Clamp(_configuration.GetValue("AgentRunWatchdog:SweepIntervalSeconds", 120), 30, 600);
        var staleAfterMinutes = Math.Clamp(_configuration.GetValue("AgentRunWatchdog:StaleAfterMinutes", 22), 10, 240);

        _logger.LogInformation(
            "StaleAgentRunWatchdog started (interval {Interval}s, stale after {Stale} min).",
            intervalSec,
            staleAfterMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(intervalSec), stoppingToken).ConfigureAwait(false);
                await SweepOnceAsync(staleAfterMinutes, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "StaleAgentRunWatchdog sweep iteration failed.");
            }
        }
    }

    private async Task SweepOnceAsync(int staleAfterMinutes, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();
        var agentService = scope.ServiceProvider.GetRequiredService<IAgentService>();

        var threshold = DateTime.UtcNow.AddMinutes(-staleAfterMinutes);
        var candidates = await db.AgentRuns
            .AsNoTracking()
            .Where(r => r.Status == AgentTaskStatus.InProgress && r.StartedAt < threshold)
            .OrderBy(r => r.StartedAt)
            .Select(r => new { r.Id, r.AgentId, r.TenantId })
            .Take(40)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (candidates.Count == 0)
            return;

        _logger.LogWarning(
            "StaleAgentRunWatchdog found {Count} InProgress agent run(s) older than {Minutes} minutes; cancelling.",
            candidates.Count,
            staleAfterMinutes);

        foreach (var c in candidates)
        {
            try
            {
                var dto = await agentService
                    .CancelStuckAgentExecutionAsync(c.AgentId, c.TenantId, c.Id, 0, force: true, cancellationToken)
                    .ConfigureAwait(false);
                if (dto.Cancelled)
                {
                    _logger.LogInformation(
                        "Cancelled stale agent run {RunId} (agent {AgentId}, tenant {TenantId}).",
                        c.Id,
                        c.AgentId,
                        c.TenantId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Failed to cancel stale agent run {RunId} (agent {AgentId}).",
                    c.Id,
                    c.AgentId);
            }
        }
    }
}
