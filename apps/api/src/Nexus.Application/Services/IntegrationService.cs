using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IIntegrationService
{
    Task<List<IntegrationConnectionDto>> GetConnectionsAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<IntegrationConnectionDto> CreateConnectionAsync(Guid tenantId, CreateIntegrationRequest request, CancellationToken cancellationToken = default);
    Task<IntegrationConnectionDto> UpdateConnectionAsync(Guid connectionId, UpdateIntegrationRequest request, CancellationToken cancellationToken = default);
    Task DeleteConnectionAsync(Guid connectionId, CancellationToken cancellationToken = default);
    Task<List<ProviderAccountMappingDto>> GetMappingsAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<ProviderAccountMappingDto> SetMappingAsync(Guid tenantId, SetProviderMappingRequest request, CancellationToken cancellationToken = default);
}
