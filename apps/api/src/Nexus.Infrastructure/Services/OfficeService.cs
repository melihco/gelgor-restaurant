using Microsoft.EntityFrameworkCore;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class OfficeService : IOfficeService
{
    private readonly NexusDbContext _dbContext;

    public OfficeService(NexusDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<OfficeDto>> GetOfficesByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Offices
            .Where(o => o.TenantId == tenantId)
            .OrderBy(o => o.Name)
            .Select(o => MapToDto(o))
            .ToListAsync(cancellationToken);
    }

    public async Task<OfficeDetailDto?> GetOfficeDetailAsync(Guid officeId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var office = await _dbContext.Offices
            .Include(o => o.Zones)
            .Include(o => o.Agents)
            .FirstOrDefaultAsync(o => o.Id == officeId && o.TenantId == tenantId, cancellationToken);

        if (office == null)
            return null;

        var zones = office.Zones
            .OrderBy(z => z.PositionX)
            .Select(z => new OfficeZoneDto(
                z.Id,
                z.ZoneType,
                z.Name,
                z.PositionX,
                z.PositionY,
                z.PositionZ,
                z.Width,
                z.Depth))
            .ToList();

        var agents = office.Agents
            .OrderBy(a => a.Name)
            .Select(a => new AgentDto(
                a.Id,
                a.Name,
                a.DisplayName,
                a.AvatarUrl,
                a.AgentType,
                a.State,
                a.IsEnabled,
                a.CreatedAt,
                a.UpdatedAt))
            .ToList();

        return new OfficeDetailDto(
            office.Id,
            office.Name,
            office.Description,
            office.IsDefault,
            zones,
            agents,
            office.CreatedAt,
            office.UpdatedAt);
    }

    public async Task<OfficeDto> GetDefaultOfficeAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var office = await _dbContext.Offices
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.IsDefault, cancellationToken)
            ?? throw new NotFoundException("Default office not found");

        return MapToDto(office);
    }

    private static OfficeDto MapToDto(Office office)
    {
        return new OfficeDto(
            office.Id,
            office.Name,
            office.Description,
            office.IsDefault,
            office.CreatedAt,
            office.UpdatedAt);
    }
}
