using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IBriefService
{
    Task<List<BriefDto>> GetBriefsByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
    // tenantId required to prevent IDOR — service filters by both id and tenant.
    Task<BriefDto?> GetBriefByIdAsync(Guid briefId, Guid tenantId, CancellationToken cancellationToken = default);
    Task<BriefDto> CreateBriefAsync(Guid tenantId, Guid userId, CreateBriefRequest request, CancellationToken cancellationToken = default);
    // tenantId required to prevent submitting another tenant's brief.
    Task<BriefDto> SubmitBriefAsync(Guid briefId, Guid tenantId, CancellationToken cancellationToken = default);
}
