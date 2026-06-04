namespace Nexus.Contracts.Dtos;

public record TenantCapabilityDefinitionDto(
    string Id,
    string Kind,
    string Label,
    string Description,
    IReadOnlyList<string> Industries,
    bool DefaultEnabled,
    IReadOnlyList<string> RiskSignals,
    IReadOnlyList<string> RequiredAssetIntents,
    IReadOnlyList<string> Requires);

public record TenantGalleryPolicyDto(
    IReadOnlyList<string> AllowedAssetIntents,
    string ClientPhotoPolicy,
    string BeforeAfterPolicy,
    int MaxGalleryPhotos,
    bool RequireConsentMetadata);

public record TenantOperatingProfileDto(
    Guid TenantId,
    string Industry,
    string PlaybookId,
    IReadOnlyList<string> EnabledCapabilities,
    TenantGalleryPolicyDto GalleryPolicy,
    IReadOnlyDictionary<string, string> RiskRules,
    string CustomRules);

public record PolicyEvaluationResultDto(
    string Decision,
    string CapabilityId,
    IReadOnlyList<string> Reasons);

public record GalleryAssetPolicyResultDto(
    string Decision,
    string AssetType,
    IReadOnlyList<string> Reasons,
    bool ForceUnapproved);

public record EvaluateCapabilityRequest(string CapabilityId);

public record EvaluateGalleryAssetRequest(string AssetType);
