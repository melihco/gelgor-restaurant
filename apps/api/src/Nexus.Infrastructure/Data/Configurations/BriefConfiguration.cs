using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class BriefConfiguration : IEntityTypeConfiguration<Brief>
{
    public void Configure(EntityTypeBuilder<Brief> builder)
    {
        builder.HasKey(b => b.Id);
        builder.Property(b => b.Title).IsRequired().HasMaxLength(500);
        builder.Property(b => b.Description).HasMaxLength(2000);
        builder.Property(b => b.RawContent).HasColumnType("text");
        builder.Property(b => b.Status).IsRequired();
        builder.HasIndex(b => new { b.TenantId, b.Status });

        builder.HasOne(b => b.CreatedByUser).WithMany(u => u.CreatedBriefs).HasForeignKey(b => b.CreatedByUserId);
        builder.HasMany(b => b.Attachments).WithOne(ba => ba.Brief).HasForeignKey(ba => ba.BriefId);
        builder.HasMany(b => b.Tasks).WithOne(t => t.Brief).HasForeignKey(t => t.BriefId);
    }
}
