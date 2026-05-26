namespace Nexus.Domain.Common;

public abstract class TenantEntity : BaseEntity
{
    public Guid TenantId { get; set; }
}
