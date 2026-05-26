using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class AgentMemoryReference : TenantEntity
{
    public Guid AgentId { get; set; }
    public string MemoryType { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = "{}";
    public Guid? VectorId { get; set; }
    public DateTime? ExpiresAt { get; set; }

    public Agent? Agent { get; set; }
    public Tenant? Tenant { get; set; }
}
