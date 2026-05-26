using Nexus.Contracts.Dtos;
using Nexus.Domain.Enums;

namespace Nexus.Application.Services;

public interface INotificationService
{
    Task<List<NotificationDto>> GetNotificationsByUserAsync(Guid tenantId, Guid userId, CancellationToken cancellationToken = default);
    Task<NotificationDto> CreateNotificationAsync(Guid tenantId, Guid userId, NotificationType type, string title, string message, Guid? relatedEntityId = null, string relatedEntityType = "", CancellationToken cancellationToken = default);
    Task<NotificationDto> MarkAsReadAsync(Guid notificationId, CancellationToken cancellationToken = default);
}
