using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class OfficeBrandProfileConfiguration : IEntityTypeConfiguration<OfficeBrandProfile>
{
    public void Configure(EntityTypeBuilder<OfficeBrandProfile> builder)
    {
        builder.ToTable("OfficeBrandProfiles");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.DisplayName).HasMaxLength(200);
        builder.Property(e => e.Location).HasMaxLength(200);
        builder.Property(e => e.LogoUrl).HasMaxLength(1000);
        builder.Property(e => e.BrandColors).HasMaxLength(500);
        builder.Property(e => e.AccentColors).HasMaxLength(500);
        builder.Property(e => e.Contact).HasMaxLength(200);
        builder.Property(e => e.WebsiteUrl).HasMaxLength(500);
        builder.Property(e => e.ReservationUrl).HasMaxLength(500);
        builder.Property(e => e.SocialTemplateStyle).HasMaxLength(1000);
        builder.Property(e => e.DefaultCta).HasMaxLength(80);
        builder.Property(e => e.Configuration).HasColumnType("jsonb");

        builder.HasIndex(e => new { e.TenantId, e.OfficeId }).IsUnique();
        builder.HasOne(e => e.Office)
            .WithMany()
            .HasForeignKey(e => e.OfficeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
