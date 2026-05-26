using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TenantMediaAssetConfiguration : IEntityTypeConfiguration<TenantMediaAsset>
{
    public void Configure(EntityTypeBuilder<TenantMediaAsset> builder)
    {
        builder.ToTable("TenantMediaAssets");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.AssetType).HasMaxLength(80).IsRequired();
        builder.Property(e => e.Url).HasMaxLength(1000);
        builder.Property(e => e.StorageKey).HasMaxLength(500);
        builder.Property(e => e.DisplayName).HasMaxLength(200);
        builder.Property(e => e.Description).HasMaxLength(1000);
        builder.Property(e => e.Tags).HasColumnType("jsonb");
        builder.Property(e => e.UsageContext).HasMaxLength(300);

        builder.HasIndex(e => new { e.TenantId, e.OfficeId, e.AssetType, e.Priority });
        builder.HasOne(e => e.Office)
            .WithMany()
            .HasForeignKey(e => e.OfficeId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
