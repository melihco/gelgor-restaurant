using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public sealed class WorkspaceMirrorService : IWorkspaceMirrorService
{
    private static readonly Guid SeedTenantId = new("00000000-0000-0000-0000-000000000001");

    private readonly NexusDbContext _db;
    private readonly ILogger<WorkspaceMirrorService> _logger;

    public WorkspaceMirrorService(NexusDbContext db, ILogger<WorkspaceMirrorService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<WorkspaceMirrorContext> EnsureAsync(
        Guid workspaceTenantId,
        CancellationToken cancellationToken = default)
    {
        if (workspaceTenantId == Guid.Empty)
            throw new ArgumentException("Workspace tenant id is required.", nameof(workspaceTenantId));

        var existing = await LoadExistingAsync(workspaceTenantId, cancellationToken);
        if (existing != null)
            return existing;

        try
        {
            return await CreateMirrorAsync(workspaceTenantId, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(
                ex,
                "Workspace mirror race for {TenantId}; reloading",
                workspaceTenantId);
            var raced = await LoadExistingAsync(workspaceTenantId, cancellationToken);
            if (raced != null)
                return raced;
            throw;
        }
    }

    private async Task<WorkspaceMirrorContext?> LoadExistingAsync(
        Guid workspaceTenantId,
        CancellationToken cancellationToken)
    {
        var tenant = await _db.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == workspaceTenantId && !t.IsDeleted, cancellationToken);
        if (tenant == null)
            return null;

        var userId = await _db.Users
            .AsNoTracking()
            .Where(u => u.TenantId == workspaceTenantId && u.IsActive && !u.IsDeleted)
            .OrderBy(u => u.CreatedAt)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (userId == Guid.Empty)
            userId = MirrorSystemUserId(workspaceTenantId);

        var officeId = await _db.Offices
            .AsNoTracking()
            .Where(o => o.TenantId == workspaceTenantId && o.IsDefault && !o.IsDeleted)
            .Select(o => o.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (officeId == Guid.Empty)
            officeId = MirrorDefaultOfficeId(workspaceTenantId);

        return new WorkspaceMirrorContext(workspaceTenantId, userId, officeId, Created: false);
    }

    private async Task<WorkspaceMirrorContext> CreateMirrorAsync(
        Guid workspaceTenantId,
        CancellationToken cancellationToken)
    {
        if (workspaceTenantId == SeedTenantId)
        {
            var seed = await LoadExistingAsync(workspaceTenantId, cancellationToken);
            if (seed != null)
                return seed;
        }

        var systemUserId = MirrorSystemUserId(workspaceTenantId);
        var officeId = MirrorDefaultOfficeId(workspaceTenantId);
        var slug = $"ws-{workspaceTenantId:N}";
        var shortId = workspaceTenantId.ToString("N")[..8];

        var tenant = new Tenant
        {
            Id = workspaceTenantId,
            Name = $"Workspace {shortId}",
            Slug = slug,
            Plan = "Starter",
            IsActive = true,
            Settings = "{\"source\":\"workspace_mirror\"}",
            CreatedBy = systemUserId,
            UpdatedBy = systemUserId,
        };
        _db.Tenants.Add(tenant);

        var office = new Office
        {
            Id = officeId,
            TenantId = workspaceTenantId,
            Name = "Main Office",
            Description = "Auto-provisioned workspace office",
            IsDefault = true,
            Configuration = "{}",
            CreatedBy = systemUserId,
            UpdatedBy = systemUserId,
        };
        _db.Offices.Add(office);

        var user = new User
        {
            Id = systemUserId,
            TenantId = workspaceTenantId,
            Email = $"system+{workspaceTenantId:N}@internal.smartagency.local",
            DisplayName = "System",
            Role = "Owner",
            PasswordHash = string.Empty,
            IsActive = true,
            CreatedBy = systemUserId,
            UpdatedBy = systemUserId,
        };
        _db.Users.Add(user);

        await _db.SaveChangesAsync(cancellationToken);

        await EnsureDefaultTaskAsync(workspaceTenantId, systemUserId, cancellationToken);

        _logger.LogInformation(
            "Provisioned Nexus mirror tenant {TenantId} slug={Slug}",
            workspaceTenantId,
            slug);

        return new WorkspaceMirrorContext(workspaceTenantId, systemUserId, officeId, Created: true);
    }

    private async Task EnsureDefaultTaskAsync(
        Guid tenantId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var hasTask = await _db.TaskItems
            .AnyAsync(t => t.TenantId == tenantId && !t.IsDeleted, cancellationToken);
        if (hasTask)
            return;

        var brief = new Brief
        {
            TenantId = tenantId,
            CreatedByUserId = userId,
            Title = "AI İçerik Üretimi",
            Description = "Otomatik oluşturulan varsayılan brief.",
            RawContent = "{}",
            Status = BriefStatus.Draft,
            CreatedBy = userId,
            UpdatedBy = userId,
        };
        _db.Briefs.Add(brief);
        await _db.SaveChangesAsync(cancellationToken);

        _db.TaskItems.Add(new TaskItem
        {
            TenantId = tenantId,
            BriefId = brief.Id,
            Title = "İçerik Üretimi",
            Description = "AI tarafından üretilen içerikler için varsayılan görev.",
            AgentType = AgentType.SocialMediaDesigner,
            Status = Nexus.Domain.Enums.TaskStatus.Pending,
            Priority = TaskPriority.Normal,
            CreatedBy = userId,
            UpdatedBy = userId,
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    internal static Guid MirrorSystemUserId(Guid tenantId) => DeriveChildId(tenantId, 0x01);

    internal static Guid MirrorDefaultOfficeId(Guid tenantId) => DeriveChildId(tenantId, 0x02);

    private static Guid DeriveChildId(Guid tenantId, byte tag)
    {
        var bytes = tenantId.ToByteArray();
        bytes[15] = tag;
        return new Guid(bytes);
    }
}
