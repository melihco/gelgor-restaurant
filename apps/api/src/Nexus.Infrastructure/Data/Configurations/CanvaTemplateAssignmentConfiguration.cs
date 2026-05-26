using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class CanvaTemplateAssignmentConfiguration : IEntityTypeConfiguration<CanvaTemplateAssignment>
{
    public void Configure(EntityTypeBuilder<CanvaTemplateAssignment> builder)
    {
        builder.ToTable("CanvaTemplateAssignments");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.CanvaTemplateId).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Name).HasMaxLength(200).IsRequired();
        builder.Property(e => e.ContentKinds).HasColumnType("jsonb");
        builder.Property(e => e.UseCases).HasColumnType("jsonb");
        builder.Property(e => e.TemplateFamilyId).HasMaxLength(120);
        builder.Property(e => e.AllowedIntents).HasColumnType("jsonb");
        builder.Property(e => e.AllowedChannels).HasColumnType("jsonb");
        builder.Property(e => e.RequiredAssetIntents).HasColumnType("jsonb");
        builder.Property(e => e.RiskTier).HasMaxLength(20);
        builder.Property(e => e.Status).HasMaxLength(30);
        builder.Property(e => e.AspectRatio).HasMaxLength(20);
        builder.Property(e => e.DatasetContract).HasColumnType("jsonb");
        builder.Property(e => e.Notes).HasMaxLength(1000);

        builder.HasIndex(e => new { e.TenantId, e.OfficeId, e.CanvaTemplateId }).IsUnique();
        builder.HasIndex(e => new { e.TenantId, e.OfficeId, e.Enabled, e.Priority });
        builder.HasIndex(e => new { e.TenantId, e.OfficeId, e.Status, e.RiskTier });
        builder.HasOne(e => e.Office)
            .WithMany()
            .HasForeignKey(e => e.OfficeId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
