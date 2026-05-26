using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.HasKey(al => al.Id);
        builder.Property(al => al.Action).IsRequired().HasMaxLength(100);
        builder.Property(al => al.EntityType).IsRequired().HasMaxLength(100);
        builder.Property(al => al.OldValues).HasColumnType("jsonb");
        builder.Property(al => al.NewValues).HasColumnType("jsonb");
        builder.HasIndex(al => new { al.TenantId, al.EntityType, al.EntityId });

        builder.HasOne(al => al.User).WithMany(u => u.AuditLogs).HasForeignKey(al => al.UserId).IsRequired(false);
    }
}
