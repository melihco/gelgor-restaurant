using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;

namespace Nexus.Application.Services;

public interface ITenantOperatingPolicyService
{
    IReadOnlyList<TenantCapabilityDefinitionDto> GetCapabilityCatalog(string? industry = null);

    TenantOperatingProfileDto ResolveProfile(CompanyProfile profile);

    PolicyEvaluationResultDto EvaluateCapability(CompanyProfile profile, string capabilityId);

    GalleryAssetPolicyResultDto EvaluateGalleryAsset(CompanyProfile profile, string assetType);
}
