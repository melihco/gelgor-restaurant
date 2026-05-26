using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IOfficeService
{
    Task<List<OfficeDto>> GetOfficesByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<OfficeDetailDto?> GetOfficeDetailAsync(Guid officeId, CancellationToken cancellationToken = default);
    Task<OfficeDto> GetDefaultOfficeAsync(Guid tenantId, CancellationToken cancellationToken = default);
}
