using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class BrandMemoryDocumentConfiguration : IEntityTypeConfiguration<BrandMemoryDocument>
{
    public void Configure(EntityTypeBuilder<BrandMemoryDocument> builder)
    {
        builder.HasKey(bm => bm.Id);
        builder.Property(bm => bm.DocumentType).IsRequired().HasMaxLength(100);
        builder.Property(bm => bm.Title).IsRequired().HasMaxLength(500);
        builder.Property(bm => bm.Content).HasColumnType("text");
        builder.HasIndex(bm => new { bm.TenantId, bm.DocumentType });

        builder.HasOne(bm => bm.Tenant).WithMany(t => t.BrandMemories).HasForeignKey(bm => bm.TenantId);
    }
}
