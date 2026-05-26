using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface ISetupService
{
    Task<CompanyProfileDto> GetCompanyProfileAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<CompanyProfileDto> SaveCompanyProfileAsync(Guid tenantId, SaveCompanyProfileRequest request, CancellationToken cancellationToken = default);
    Task<CompanyProfileDto> CompleteSetupAsync(Guid tenantId, CancellationToken cancellationToken = default);
}
