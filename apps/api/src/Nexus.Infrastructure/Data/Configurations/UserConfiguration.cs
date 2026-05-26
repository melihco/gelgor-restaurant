using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Email).IsRequired().HasMaxLength(255);
        builder.HasIndex(u => new { u.TenantId, u.Email }).IsUnique();
        builder.Property(u => u.DisplayName).IsRequired().HasMaxLength(255);
        builder.Property(u => u.AvatarUrl).HasMaxLength(500);
        builder.Property(u => u.Role).HasMaxLength(50);
        builder.Property(u => u.PasswordHash).HasMaxLength(500);

        builder.HasOne(u => u.Tenant).WithMany(t => t.Users).HasForeignKey(u => u.TenantId);
        builder.HasMany(u => u.CreatedBriefs).WithOne(b => b.CreatedByUser).HasForeignKey(b => b.CreatedByUserId);
        builder.HasMany(u => u.ReviewDecisions).WithOne(rd => rd.ReviewedByUser).HasForeignKey(rd => rd.ReviewedByUserId);
    }
}
