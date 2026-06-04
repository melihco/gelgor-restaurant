using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class UsageQuotaService : IUsageQuotaService
{
    private readonly NexusDbContext _context;

    public UsageQuotaService(NexusDbContext context)
    {
        _context = context;
    }

    public async Task<UsageQuotaSummaryDto> GetUsageSummaryAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var subscription = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);
        var periodStart = subscription?.CurrentPeriodStart ?? DateTime.UtcNow.Date;
        var periodEnd = subscription?.CurrentPeriodEnd ?? DateTime.UtcNow.Date.AddMonths(1);
        var providerActionLimit = PackageQuotaLimits.ResolveProviderActionLimit(subscription?.Package?.Slug);
        var liveProviderActionLimit = PackageQuotaLimits.ResolveLiveProviderActionLimit(subscription?.Package?.Slug);
        var tokenLimit = PackageQuotaLimits.ResolveTokenLimit(subscription?.Package?.Slug);

        var providerActionsUsed = await _context.ExecutionJobs
            .Where(job => job.SuggestedAction != null &&
                          job.SuggestedAction.TenantId == tenantId &&
                          (job.StartedAt ?? job.CreatedAt) >= periodStart &&
                          (job.StartedAt ?? job.CreatedAt) < periodEnd)
            .CountAsync(cancellationToken);

        var providerActionAuditLogs = await _context.ExecutionJobs
            .Where(job => job.SuggestedAction != null &&
                          job.SuggestedAction.TenantId == tenantId &&
                          (job.StartedAt ?? job.CreatedAt) >= periodStart &&
                          (job.StartedAt ?? job.CreatedAt) < periodEnd)
            .Select(job => job.AuditLog)
            .ToListAsync(cancellationToken);
        var liveProviderActionsUsed = providerActionAuditLogs.Count(log => log.Contains("\"mode\":\"live\"", StringComparison.OrdinalIgnoreCase));

        var tokensUsed = await _context.AgentRuns
            .Where(run => run.TenantId == tenantId &&
                          run.StartedAt >= periodStart &&
                          run.StartedAt < periodEnd)
            .SumAsync(run => run.TokensUsed, cancellationToken);

        var packageSlug = subscription?.Package?.Slug;
        var agentRunLimit = PackagePlanCatalog.ResolveAgentRunLimit(packageSlug);
        if (agentRunLimit == 0)
            agentRunLimit = subscription?.Package?.TaskLimitPerMonth ?? 0;
        var agentRunsUsed = subscription?.TasksUsedThisPeriod ?? 0;

        var plan = PackagePlanCatalog.TryGet(packageSlug);
        PlanMonthlyOutputsDto? outputs = plan == null
            ? null
            : new PlanMonthlyOutputsDto(
                plan.MonthlyMissions,
                plan.MonthlySocialContent,
                plan.MonthlyGalleryAnalysis,
                plan.MonthlyReels);

        return new UsageQuotaSummaryDto(
            subscription?.Id,
            subscription?.Package?.Name ?? "No active package",
            packageSlug ?? "none",
            subscription?.Status.ToString() ?? "Missing",
            subscription?.CurrentPeriodStart,
            subscription?.CurrentPeriodEnd,
            ToMetric(agentRunsUsed, agentRunLimit),
            ToMetric(providerActionsUsed, providerActionLimit),
            ToMetric(liveProviderActionsUsed, liveProviderActionLimit),
            ToMetric(tokensUsed, tokenLimit),
            outputs,
            null);
    }

    public async Task<QuotaCheckResult> EnsureAgentRunAllowedAsync(
        Guid tenantId,
        int requestedUnits = 1,
        CancellationToken cancellationToken = default)
    {
        var subscription = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);
        if (subscription == null)
        {
            return new QuotaCheckResult(false, "subscription_required", "Active subscription is required before running agents.", 0, 0);
        }

        var limit = PackagePlanCatalog.ResolveAgentRunLimit(subscription.Package?.Slug);
        if (limit == 0)
            limit = subscription.Package?.TaskLimitPerMonth ?? 0;
        if (limit < 0)
        {
            return new QuotaCheckResult(true, "allowed", "Agent run quota is unlimited.", subscription.TasksUsedThisPeriod, limit);
        }

        var projected = subscription.TasksUsedThisPeriod + Math.Max(1, requestedUnits);
        if (projected > limit)
        {
            return new QuotaCheckResult(false, "agent_run_quota_exceeded", "Monthly agent run quota exceeded for the active package.", subscription.TasksUsedThisPeriod, limit);
        }

        return new QuotaCheckResult(true, "allowed", "Agent run quota available.", subscription.TasksUsedThisPeriod, limit);
    }

    public async Task RecordAgentRunAsync(Guid tenantId, int units = 1, CancellationToken cancellationToken = default)
    {
        var subscription = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);
        if (subscription == null)
            return;

        if (subscription.CurrentPeriodEnd <= DateTime.UtcNow)
        {
            subscription.CurrentPeriodStart = DateTime.UtcNow.Date;
            subscription.CurrentPeriodEnd = DateTime.UtcNow.Date.AddMonths(1);
            subscription.TasksUsedThisPeriod = 0;
        }

        subscription.TasksUsedThisPeriod += Math.Max(1, units);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<QuotaCheckResult> EnsureTokenBudgetAllowedAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var summary = await GetUsageSummaryAsync(tenantId, cancellationToken);
        var metric = summary.Tokens;
        if (metric.IsUnlimited || metric.Limit <= 0 || metric.Used < metric.Limit)
            return new QuotaCheckResult(true, "allowed", "Token usage is within the active package budget.", metric.Used, metric.Limit);

        return new QuotaCheckResult(
            false,
            "token_budget_exceeded",
            "Monthly token budget is already exceeded for the active package. Upgrade or wait for the next billing period before starting new agent runs.",
            metric.Used,
            metric.Limit);
    }

    public async Task<QuotaCheckResult> EnsureProviderActionAllowedAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var summary = await GetUsageSummaryAsync(tenantId, cancellationToken);
        var metric = summary.ProviderActions;
        if (metric.IsUnlimited || metric.Used < metric.Limit)
        {
            return new QuotaCheckResult(true, "allowed", "Provider action quota available.", metric.Used, metric.Limit);
        }

        return new QuotaCheckResult(false, "provider_action_quota_exceeded", "Monthly provider action quota exceeded for the active package.", metric.Used, metric.Limit);
    }

    public async Task<QuotaCheckResult> EnsureLiveProviderActionAllowedAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        var summary = await GetUsageSummaryAsync(tenantId, cancellationToken);
        var metric = summary.LiveProviderActions;
        if (metric.IsUnlimited || metric.Used < metric.Limit)
            return new QuotaCheckResult(true, "allowed", "Live provider action quota available.", metric.Used, metric.Limit);

        return new QuotaCheckResult(false, "live_provider_action_quota_exceeded", "Live provider action quota exceeded for the active package.", metric.Used, metric.Limit);
    }

    public async Task<QuotaCheckResult> EnsureAgentTypeEntitledAsync(
        Guid tenantId,
        AgentType agentType,
        CancellationToken cancellationToken = default)
    {
        var subscription = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);
        if (subscription == null)
            return new QuotaCheckResult(false, "subscription_required", "Active subscription is required.", 0, 0);

        var allowedNames = ResolveAllowedAgentTypeNames(subscription);
        var name = agentType.ToString();
        if (!allowedNames.Contains(name))
            return new QuotaCheckResult(false, "agent_not_in_package", $"{name} is not included in the active package. Upgrade or add this agent.", 0, 0);

        return new QuotaCheckResult(true, "allowed", "Agent type entitlement OK.", allowedNames.Count, 0);
    }

    public async Task<QuotaCheckResult> EnsureAgentTypesEntitledAsync(
        Guid tenantId,
        IReadOnlyCollection<AgentType> agentTypes,
        CancellationToken cancellationToken = default)
    {
        var subscription = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);
        if (subscription == null)
            return new QuotaCheckResult(false, "subscription_required", "Active subscription is required.", 0, 0);

        var allowedNames = ResolveAllowedAgentTypeNames(subscription);
        foreach (var agentType in agentTypes)
        {
            var name = agentType.ToString();
            if (!allowedNames.Contains(name))
                return new QuotaCheckResult(false, "agent_not_in_package", $"{name} is not included in the active package. Upgrade to run this workflow.", 0, 0);
        }

        return new QuotaCheckResult(true, "allowed", "All workflow agent types entitled.", agentTypes.Count, 0);
    }

    private static HashSet<string> ResolveAllowedAgentTypeNames(TenantSubscription subscription)
    {
        var comparer = StringComparer.OrdinalIgnoreCase;
        var set = new HashSet<string>(comparer);

        foreach (var addOn in subscription.AddOnAgents ?? Array.Empty<SubscriptionAgent>())
            set.Add(addOn.AgentType.ToString());

        var json = subscription.Package?.IncludedAgentTypes;
        if (string.IsNullOrWhiteSpace(json))
            return set;

        try
        {
            var parsed = JsonSerializer.Deserialize<string[]>(json);
            if (parsed != null)
            {
                foreach (var item in parsed)
                {
                    if (!string.IsNullOrWhiteSpace(item))
                        set.Add(item.Trim());
                }
            }
        }
        catch
        {
            // ignore malformed payload; entitlement remains add-ons-only
        }

        return set;
    }

    private static UsageQuotaMetricDto ToMetric(int used, int limit)
    {
        var isUnlimited = limit < 0;
        var remaining = isUnlimited ? -1 : Math.Max(0, limit - used);
        var percent = isUnlimited || limit == 0 ? 0 : Math.Min(100, Math.Round((decimal)used / limit * 100, 1));
        return new UsageQuotaMetricDto(used, limit, remaining, percent, isUnlimited);
    }

}
