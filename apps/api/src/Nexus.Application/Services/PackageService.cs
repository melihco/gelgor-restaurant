using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IPackageService
{
    Task<List<PackageDefinitionDto>> GetPackagesAsync(CancellationToken cancellationToken = default);
    Task<TenantSubscriptionDto?> GetSubscriptionAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<TenantSubscriptionDto> SelectPackageAsync(Guid tenantId, SelectPackageRequest request, CancellationToken cancellationToken = default);
}
