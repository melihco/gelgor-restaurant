using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class BrandMemoryDocument : TenantEntity, ISoftDeletable
{
    public string DocumentType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public Guid? EmbeddingId { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Tenant? Tenant { get; set; }
}
