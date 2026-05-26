using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class TenantMediaAsset : TenantEntity, ISoftDeletable
{
    public Guid? OfficeId { get; set; }
    public string AssetType { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Tags { get; set; } = "[]";
    public string UsageContext { get; set; } = string.Empty;
    public bool IsApproved { get; set; } = true;
    public int Priority { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Office? Office { get; set; }
}
