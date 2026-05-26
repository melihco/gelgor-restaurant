using Microsoft.EntityFrameworkCore;
using Nexus.Domain.Common;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data.Configurations;

namespace Nexus.Infrastructure.Data;

public class NexusDbContext : DbContext
{
    private readonly string _currentTenantId = Guid.Empty.ToString();
    private readonly Guid _currentUserId = Guid.Empty;

    public NexusDbContext(DbContextOptions<NexusDbContext> options) : base(options)
    {
    }

    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<Office> Offices { get; set; }
    public DbSet<OfficeZone> OfficeZones { get; set; }
    public DbSet<Agent> Agents { get; set; }
    public DbSet<AgentCapability> AgentCapabilities { get; set; }
    public DbSet<Brief> Briefs { get; set; }
    public DbSet<BriefAttachment> BriefAttachments { get; set; }
    public DbSet<TaskItem> TaskItems { get; set; }
    public DbSet<TaskDependency> TaskDependencies { get; set; }
    public DbSet<TaskAssignment> TaskAssignments { get; set; }
    public DbSet<AgentRun> AgentRuns { get; set; }
    public DbSet<OutputArtifact> OutputArtifacts { get; set; }
    public DbSet<ReviewDecision> ReviewDecisions { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<AuditLog> AuditLogs { get; set; }
    public DbSet<BrandMemoryDocument> BrandMemoryDocuments { get; set; }
    public DbSet<AgentMemoryReference> AgentMemoryReferences { get; set; }

    // Faz 1: Setup, Packages, Integrations, Actions
    public DbSet<CompanyProfile> CompanyProfiles { get; set; }
    public DbSet<IntegrationConnection> IntegrationConnections { get; set; }
    public DbSet<ProviderAccountMapping> ProviderAccountMappings { get; set; }
    public DbSet<PackageDefinition> PackageDefinitions { get; set; }
    public DbSet<TenantSubscription> TenantSubscriptions { get; set; }
    public DbSet<SubscriptionAgent> SubscriptionAgents { get; set; }
    public DbSet<SuggestedAction> SuggestedActions { get; set; }
    public DbSet<ExecutionJob> ExecutionJobs { get; set; }
    public DbSet<TenantMediaAsset> TenantMediaAssets { get; set; }
    public DbSet<OfficeBrandProfile> OfficeBrandProfiles { get; set; }
    public DbSet<CanvaTemplateAssignment> CanvaTemplateAssignments { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ApplyConfiguration(new TenantConfiguration());
        modelBuilder.ApplyConfiguration(new UserConfiguration());
        modelBuilder.ApplyConfiguration(new OfficeConfiguration());
        modelBuilder.ApplyConfiguration(new OfficeZoneConfiguration());
        modelBuilder.ApplyConfiguration(new AgentConfiguration());
        modelBuilder.ApplyConfiguration(new AgentCapabilityConfiguration());
        modelBuilder.ApplyConfiguration(new BriefConfiguration());
        modelBuilder.ApplyConfiguration(new BriefAttachmentConfiguration());
        modelBuilder.ApplyConfiguration(new TaskItemConfiguration());
        modelBuilder.ApplyConfiguration(new TaskDependencyConfiguration());
        modelBuilder.ApplyConfiguration(new TaskAssignmentConfiguration());
        modelBuilder.ApplyConfiguration(new AgentRunConfiguration());
        modelBuilder.ApplyConfiguration(new OutputArtifactConfiguration());
        modelBuilder.ApplyConfiguration(new ReviewDecisionConfiguration());
        modelBuilder.ApplyConfiguration(new NotificationConfiguration());
        modelBuilder.ApplyConfiguration(new AuditLogConfiguration());
        modelBuilder.ApplyConfiguration(new BrandMemoryDocumentConfiguration());
        modelBuilder.ApplyConfiguration(new AgentMemoryReferenceConfiguration());

        // Faz 1
        modelBuilder.ApplyConfiguration(new CompanyProfileConfiguration());
        modelBuilder.ApplyConfiguration(new IntegrationConnectionConfiguration());
        modelBuilder.ApplyConfiguration(new ProviderAccountMappingConfiguration());
        modelBuilder.ApplyConfiguration(new PackageDefinitionConfiguration());
        modelBuilder.ApplyConfiguration(new TenantSubscriptionConfiguration());
        modelBuilder.ApplyConfiguration(new SubscriptionAgentConfiguration());
        modelBuilder.ApplyConfiguration(new SuggestedActionConfiguration());
        modelBuilder.ApplyConfiguration(new ExecutionJobConfiguration());
        modelBuilder.ApplyConfiguration(new TenantMediaAssetConfiguration());
        modelBuilder.ApplyConfiguration(new OfficeBrandProfileConfiguration());
        modelBuilder.ApplyConfiguration(new CanvaTemplateAssignmentConfiguration());

        modelBuilder.AddTenantFilter();
        modelBuilder.AddSoftDeleteFilter();
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var entries = ChangeTracker.Entries();

        foreach (var entry in entries)
        {
            if (entry.Entity is BaseEntity baseEntity)
            {
                if (entry.State == EntityState.Added)
                {
                    baseEntity.CreatedAt = DateTime.UtcNow;
                    baseEntity.CreatedBy = _currentUserId;
                }

                if (entry.State == EntityState.Modified)
                {
                    baseEntity.UpdatedAt = DateTime.UtcNow;
                    baseEntity.UpdatedBy = _currentUserId;
                    entry.Property(nameof(BaseEntity.CreatedAt)).IsModified = false;
                    entry.Property(nameof(BaseEntity.CreatedBy)).IsModified = false;
                }
            }

            if (entry.Entity is ISoftDeletable softDeletable && entry.State == EntityState.Deleted)
            {
                softDeletable.IsDeleted = true;
                softDeletable.DeletedAt = DateTime.UtcNow;
                entry.State = EntityState.Modified;
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}
