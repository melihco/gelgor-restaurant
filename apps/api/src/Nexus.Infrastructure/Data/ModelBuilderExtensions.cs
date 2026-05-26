using Microsoft.EntityFrameworkCore;
using Nexus.Domain.Common;

namespace Nexus.Infrastructure.Data;

public static class ModelBuilderExtensions
{
    public static void AddTenantFilter(this ModelBuilder modelBuilder)
    {
        var tenantType = typeof(TenantEntity);
        var entities = modelBuilder.Model.GetEntityTypes();

        foreach (var entityType in entities)
        {
            if (tenantType.IsAssignableFrom(entityType.ClrType) && !entityType.ClrType.IsAbstract)
            {
                var method = typeof(ModelBuilderExtensions)
                    .GetMethods()
                    .Single(t => t.IsGenericMethodDefinition && t.Name == nameof(AddTenantFilter))
                    .MakeGenericMethod(entityType.ClrType);
                method.Invoke(null, new object[] { modelBuilder });
            }
        }
    }

    public static void AddTenantFilter<TEntity>(this ModelBuilder modelBuilder)
        where TEntity : TenantEntity
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e => true);
    }

    public static void AddSoftDeleteFilter(this ModelBuilder modelBuilder)
    {
        var softDeletableType = typeof(ISoftDeletable);
        var entities = modelBuilder.Model.GetEntityTypes();

        foreach (var entityType in entities)
        {
            if (softDeletableType.IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(ModelBuilderExtensions)
                    .GetMethods()
                    .Single(t => t.IsGenericMethodDefinition && t.Name == nameof(AddSoftDeleteFilter))
                    .MakeGenericMethod(entityType.ClrType);
                method.Invoke(null, new object[] { modelBuilder });
            }
        }
    }

    public static void AddSoftDeleteFilter<TEntity>(this ModelBuilder modelBuilder)
        where TEntity : class, ISoftDeletable
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e => !e.IsDeleted);
    }
}
