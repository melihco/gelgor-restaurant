using Microsoft.EntityFrameworkCore;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

internal static class SubscriptionResolution
{
    public static async Task<TenantSubscription?> GetActiveSubscriptionAsync(
        NexusDbContext context,
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var inPeriod = await BuildBaseQuery(context, tenantId)
            .Where(subscription => subscription.CurrentPeriodEnd > now)
            .OrderByDescending(subscription => subscription.Package != null ? subscription.Package.SortOrder : 0)
            .ThenByDescending(subscription => subscription.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (inPeriod != null)
            return inPeriod;

        return await BuildBaseQuery(context, tenantId)
            .OrderByDescending(subscription => subscription.Package != null ? subscription.Package.SortOrder : 0)
            .ThenByDescending(subscription => subscription.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static IQueryable<TenantSubscription> BuildBaseQuery(NexusDbContext context, Guid tenantId)
    {
        return context.TenantSubscriptions
            .Include(subscription => subscription.Package)
            .Include(subscription => subscription.AddOnAgents)
            .Where(subscription =>
                subscription.TenantId == tenantId &&
                subscription.Status != SubscriptionStatus.Cancelled);
    }
}
