using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private readonly NexusDbContext _dbContext;

    public NotificationService(NexusDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<NotificationDto>> GetNotificationsByUserAsync(Guid tenantId, Guid userId, CancellationToken cancellationToken = default)
    {
        // MapToDto cannot be translated to SQL — materialize first, then map in memory.
        var rows = await _dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.TenantId == tenantId && n.UserId == userId && !n.IsDeleted)
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync(cancellationToken);

        return rows.ConvertAll(MapToDto);
    }

    public async Task<NotificationDto> CreateNotificationAsync(
        Guid tenantId,
        Guid userId,
        NotificationType type,
        string title,
        string message,
        Guid? relatedEntityId = null,
        string relatedEntityType = "",
        CancellationToken cancellationToken = default)
    {
        var notification = new Notification
        {
            TenantId = tenantId,
            UserId = userId,
            Type = type,
            Title = title,
            Message = message,
            IsRead = false,
            RelatedEntityId = relatedEntityId,
            RelatedEntityType = relatedEntityType,
            CreatedBy = Guid.Empty,
            UpdatedBy = Guid.Empty
        };

        _dbContext.Notifications.Add(notification);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(notification);
    }

    public async Task<NotificationDto> MarkAsReadAsync(Guid notificationId, CancellationToken cancellationToken = default)
    {
        var notification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId, cancellationToken)
            ?? throw new InvalidOperationException("Notification not found");

        notification.IsRead = true;
        notification.UpdatedBy = Guid.Empty;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(notification);
    }

    private static NotificationDto MapToDto(Notification notification)
    {
        return new NotificationDto(
            notification.Id,
            notification.Type,
            notification.Title,
            notification.Message,
            notification.IsRead,
            notification.RelatedEntityId,
            notification.RelatedEntityType,
            notification.CreatedAt);
    }
}
