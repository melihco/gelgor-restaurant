using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class Tenant : BaseEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string LogoUrl { get; set; } = string.Empty;
    public string Plan { get; set; } = "Starter";
    public bool IsActive { get; set; } = true;
    public string Settings { get; set; } = "{}";
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Office> Offices { get; set; } = new List<Office>();
    public ICollection<Agent> Agents { get; set; } = new List<Agent>();
    public ICollection<Brief> Briefs { get; set; } = new List<Brief>();
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
    public ICollection<OutputArtifact> Artifacts { get; set; } = new List<OutputArtifact>();
    public ICollection<AgentRun> AgentRuns { get; set; } = new List<AgentRun>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
    public ICollection<BrandMemoryDocument> BrandMemories { get; set; } = new List<BrandMemoryDocument>();
    public ICollection<AgentMemoryReference> AgentMemories { get; set; } = new List<AgentMemoryReference>();
    public CompanyProfile? CompanyProfile { get; set; }
    public ICollection<IntegrationConnection> IntegrationConnections { get; set; } = new List<IntegrationConnection>();
    public ICollection<TenantSubscription> Subscriptions { get; set; } = new List<TenantSubscription>();
}
