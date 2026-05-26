using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class PackageDefinitionConfiguration : IEntityTypeConfiguration<PackageDefinition>
{
    public void Configure(EntityTypeBuilder<PackageDefinition> builder)
    {
        builder.ToTable("PackageDefinitions");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Name).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Slug).HasMaxLength(100).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(500);
        builder.Property(e => e.MonthlyPrice).HasPrecision(10, 2);
        builder.Property(e => e.YearlyPrice).HasPrecision(10, 2);
        builder.Property(e => e.IncludedAgentTypes).HasColumnType("jsonb");
        builder.Property(e => e.Features).HasColumnType("jsonb");

        builder.HasIndex(e => e.Slug).IsUnique();
    }
}
