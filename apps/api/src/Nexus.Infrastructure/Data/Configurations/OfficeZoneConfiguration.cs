using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class OfficeZoneConfiguration : IEntityTypeConfiguration<OfficeZone>
{
    public void Configure(EntityTypeBuilder<OfficeZone> builder)
    {
        builder.HasKey(oz => oz.Id);
        builder.Property(oz => oz.Name).IsRequired().HasMaxLength(255);
        builder.Property(oz => oz.ZoneType).IsRequired();
        builder.Property(oz => oz.Configuration).HasColumnType("jsonb");

        builder.HasOne(oz => oz.Office).WithMany(o => o.Zones).HasForeignKey(oz => oz.OfficeId);
        builder.HasMany(oz => oz.Agents).WithOne(a => a.Zone).HasForeignKey(a => a.ZoneId).IsRequired(false);
    }
}
