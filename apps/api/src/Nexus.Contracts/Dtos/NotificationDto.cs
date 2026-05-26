using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record NotificationDto(
    Guid Id,
    NotificationType Type,
    string Title,
    string Message,
    bool IsRead,
    Guid? RelatedEntityId,
    string RelatedEntityType,
    DateTime CreatedAt);

public record MarkNotificationReadRequest(
    Guid NotificationId);
