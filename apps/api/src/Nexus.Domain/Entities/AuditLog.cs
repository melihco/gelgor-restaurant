using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class AuditLog : TenantEntity
{
    public Guid UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public string OldValues { get; set; } = "{}";
    public string NewValues { get; set; } = "{}";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
