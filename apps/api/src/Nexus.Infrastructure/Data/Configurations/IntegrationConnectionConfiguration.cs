using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class IntegrationConnectionConfiguration : IEntityTypeConfiguration<IntegrationConnection>
{
    public void Configure(EntityTypeBuilder<IntegrationConnection> builder)
    {
        builder.ToTable("IntegrationConnections");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Provider).IsRequired();
        builder.Property(e => e.AccountId).HasMaxLength(200);
        builder.Property(e => e.DisplayName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Scopes).HasMaxLength(1000);
        builder.Property(e => e.EncryptedAccessToken).HasMaxLength(2000);
        builder.Property(e => e.EncryptedRefreshToken).HasMaxLength(2000);
        builder.Property(e => e.Configuration).HasColumnType("jsonb");

        builder.HasIndex(e => new { e.TenantId, e.Provider, e.AccountId }).IsUnique();

        builder.HasMany(e => e.AccountMappings)
            .WithOne(m => m.IntegrationConnection)
            .HasForeignKey(m => m.IntegrationConnectionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
