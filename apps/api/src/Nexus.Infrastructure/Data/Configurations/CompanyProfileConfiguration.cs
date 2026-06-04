using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class CompanyProfileConfiguration : IEntityTypeConfiguration<CompanyProfile>
{
    public void Configure(EntityTypeBuilder<CompanyProfile> builder)
    {
        builder.ToTable("CompanyProfiles");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.BrandName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Industry).HasMaxLength(100);
        builder.Property(e => e.Location).HasMaxLength(200);
        builder.Property(e => e.BrandTone).HasMaxLength(50);
        builder.Property(e => e.TargetAudience).HasMaxLength(500);
        builder.Property(e => e.VisualStyle).HasMaxLength(200);
        builder.Property(e => e.CampaignGoals).HasMaxLength(1000);
        builder.Property(e => e.Competitors).HasMaxLength(500);
        builder.Property(e => e.CustomRules).HasMaxLength(2000);
        builder.Property(e => e.Languages).HasMaxLength(50);
        builder.Property(e => e.LogoUrl).HasMaxLength(500);
        builder.Property(e => e.WebsiteUrl).HasMaxLength(500);
        builder.Property(e => e.Description).HasMaxLength(2000);
        builder.Property(e => e.PrimaryFont).HasMaxLength(100);
        builder.Property(e => e.SecondaryFont).HasMaxLength(100);
        builder.Property(e => e.BrandColors).HasMaxLength(500);
        builder.Property(e => e.AccentColors).HasMaxLength(500);
        builder.Property(e => e.SocialTemplateStyle).HasMaxLength(1000);
        builder.Property(e => e.LogoUsageRules).HasMaxLength(1000);

        builder.Property(e => e.InstagramHandle).HasMaxLength(100);
        builder.Property(e => e.GoogleBusinessUrl).HasMaxLength(500);
        builder.Property(e => e.BrandImageUrls).HasMaxLength(2000);
        builder.Property(e => e.BrandAnalysis).HasMaxLength(8000);
        builder.Property(e => e.BrandAnalyzedAt);
        builder.Property(e => e.PlatformProfiles).HasColumnType("jsonb");
        builder.Property(e => e.ContentNeeds).HasColumnType("jsonb");
        builder.Property(e => e.OperatingCapabilities).HasColumnType("jsonb");
        builder.Property(e => e.GalleryPolicy).HasColumnType("jsonb");
        builder.Property(e => e.TemplateFamilies).HasColumnType("jsonb");
        builder.Property(e => e.RiskRules).HasColumnType("jsonb");
        builder.Property(e => e.CustomerVisibleSummary).HasMaxLength(2000);
        builder.Property(e => e.SystemIntelligence).HasMaxLength(12000);
        builder.Property(e => e.DiscoveryConfidence);
        builder.Property(e => e.CreativeProfileConfirmedAt);

        builder.HasIndex(e => e.TenantId).IsUnique();
    }
}
