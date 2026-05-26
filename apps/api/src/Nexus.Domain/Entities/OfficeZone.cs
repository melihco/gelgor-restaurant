using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class OfficeZone : TenantEntity, ISoftDeletable
{
    public Guid OfficeId { get; set; }
    public OfficeZoneType ZoneType { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal PositionX { get; set; }
    public decimal PositionY { get; set; }
    public decimal PositionZ { get; set; }
    public decimal Width { get; set; }
    public decimal Depth { get; set; }
    public string Configuration { get; set; } = "{}";
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Office? Office { get; set; }
    public ICollection<Agent> Agents { get; set; } = new List<Agent>();
}
