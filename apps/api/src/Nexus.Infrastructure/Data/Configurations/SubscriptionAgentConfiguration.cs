using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class SubscriptionAgentConfiguration : IEntityTypeConfiguration<SubscriptionAgent>
{
    public void Configure(EntityTypeBuilder<SubscriptionAgent> builder)
    {
        builder.ToTable("SubscriptionAgents");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.MonthlyPrice).HasPrecision(10, 2);

        builder.HasIndex(e => new { e.SubscriptionId, e.AgentType }).IsUnique();
    }
}
