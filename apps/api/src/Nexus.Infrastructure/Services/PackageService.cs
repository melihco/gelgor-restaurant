using Microsoft.EntityFrameworkCore;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class PackageService : IPackageService
{
    private readonly NexusDbContext _context;

    public PackageService(NexusDbContext context)
    {
        _context = context;
    }

    public async Task<List<PackageDefinitionDto>> GetPackagesAsync(CancellationToken cancellationToken = default)
    {
        return await _context.PackageDefinitions
            .Where(p => p.IsActive)
            .OrderBy(p => p.SortOrder)
            .Select(p => new PackageDefinitionDto(
                p.Id,
                p.Name,
                p.Slug,
                p.Description,
                p.MonthlyPrice,
                p.YearlyPrice,
                p.TaskLimitPerMonth,
                p.IncludedAgentTypes,
                p.Features,
                p.SortOrder,
                p.IsPopular))
            .ToListAsync(cancellationToken);
    }

    public async Task<TenantSubscriptionDto?> GetSubscriptionAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var sub = await SubscriptionResolution.GetActiveSubscriptionAsync(_context, tenantId, cancellationToken);

        if (sub == null) return null;
        return MapToDto(sub);
    }

    public async Task<TenantSubscriptionDto> SelectPackageAsync(Guid tenantId, SelectPackageRequest request, CancellationToken cancellationToken = default)
    {
        var package = await _context.PackageDefinitions
            .FirstOrDefaultAsync(p => p.Id == request.PackageId && p.IsActive, cancellationToken)
            ?? throw new NotFoundException("Package not found");

        var existing = await _context.TenantSubscriptions
            .Include(s => s.AddOnAgents)
            .Where(s => s.TenantId == tenantId && s.Status != SubscriptionStatus.Cancelled)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
        {
            existing.PackageId = request.PackageId;
            existing.Status = SubscriptionStatus.Active;
            existing.CurrentPeriodStart = DateTime.UtcNow.Date;
            existing.CurrentPeriodEnd = DateTime.UtcNow.Date.AddMonths(1);
            existing.TasksUsedThisPeriod = 0;

            await _context.SaveChangesAsync(cancellationToken);

            existing.Package = package;
            return MapToDto(existing);
        }

        var sub = new TenantSubscription
        {
            TenantId = tenantId,
            PackageId = request.PackageId,
            Status = SubscriptionStatus.Active,
            CurrentPeriodStart = DateTime.UtcNow.Date,
            CurrentPeriodEnd = DateTime.UtcNow.Date.AddMonths(1),
            TasksUsedThisPeriod = 0,
        };

        _context.TenantSubscriptions.Add(sub);
        await _context.SaveChangesAsync(cancellationToken);

        sub.Package = package;
        return MapToDto(sub);
    }

    private static TenantSubscriptionDto MapToDto(TenantSubscription sub) => new(
        sub.Id,
        sub.PackageId,
        sub.Package?.Name ?? "",
        sub.Status,
        sub.CurrentPeriodStart,
        sub.CurrentPeriodEnd,
        sub.TasksUsedThisPeriod,
        sub.Package?.TaskLimitPerMonth ?? 0,
        sub.AddOnAgents.Select(a => new SubscriptionAgentDto(
            a.Id,
            a.AgentType,
            a.IsIncluded,
            a.IsAddOn,
            a.MonthlyPrice
        )).ToList());
}
