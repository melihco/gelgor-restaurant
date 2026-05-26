using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class ProviderAccountMappingConfiguration : IEntityTypeConfiguration<ProviderAccountMapping>
{
    public void Configure(EntityTypeBuilder<ProviderAccountMapping> builder)
    {
        builder.ToTable("ProviderAccountMappings");
        builder.HasKey(e => e.Id);

        builder.HasIndex(e => new { e.TenantId, e.AgentType, e.IntegrationConnectionId }).IsUnique();
    }
}
