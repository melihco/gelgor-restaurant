using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TenantSubscriptionConfiguration : IEntityTypeConfiguration<TenantSubscription>
{
    public void Configure(EntityTypeBuilder<TenantSubscription> builder)
    {
        builder.ToTable("TenantSubscriptions");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.ExternalSubscriptionId).HasMaxLength(200);

        builder.HasOne(e => e.Package)
            .WithMany(p => p.Subscriptions)
            .HasForeignKey(e => e.PackageId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(e => e.AddOnAgents)
            .WithOne(a => a.Subscription)
            .HasForeignKey(a => a.SubscriptionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => e.TenantId);
    }
}
