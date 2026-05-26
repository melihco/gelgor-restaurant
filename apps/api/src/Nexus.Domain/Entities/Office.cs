using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class Office : TenantEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
    public string Configuration { get; set; } = "{}";
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Tenant? Tenant { get; set; }
    public ICollection<OfficeZone> Zones { get; set; } = new List<OfficeZone>();
    public ICollection<Agent> Agents { get; set; } = new List<Agent>();
}
