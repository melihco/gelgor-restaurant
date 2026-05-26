using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class ExecutionJobConfiguration : IEntityTypeConfiguration<ExecutionJob>
{
    public void Configure(EntityTypeBuilder<ExecutionJob> builder)
    {
        builder.ToTable("ExecutionJobs");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.ErrorMessage).HasMaxLength(2000);
        builder.Property(e => e.ProviderResponse).HasColumnType("jsonb");
        builder.Property(e => e.ResultData).HasColumnType("jsonb");
        builder.Property(e => e.AuditLog).HasColumnType("jsonb");

        builder.HasIndex(e => e.Status);
    }
}
