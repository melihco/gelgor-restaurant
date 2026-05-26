using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class BriefAttachmentConfiguration : IEntityTypeConfiguration<BriefAttachment>
{
    public void Configure(EntityTypeBuilder<BriefAttachment> builder)
    {
        builder.HasKey(ba => ba.Id);
        builder.Property(ba => ba.FileName).IsRequired().HasMaxLength(500);
        builder.Property(ba => ba.ContentType).IsRequired().HasMaxLength(100);
        builder.Property(ba => ba.FilePath).IsRequired().HasMaxLength(1000);

        builder.HasOne(ba => ba.Brief).WithMany(b => b.Attachments).HasForeignKey(ba => ba.BriefId);
    }
}
