using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notificationService;
    private readonly IRequestContext _requestContext;

    public NotificationsController(INotificationService notificationService, IRequestContext requestContext)
    {
        _notificationService = notificationService;
        _requestContext = requestContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<NotificationDto>>> GetNotifications(CancellationToken cancellationToken)
    {
        var notifications = await _notificationService.GetNotificationsByUserAsync(_requestContext.TenantId, _requestContext.UserId, cancellationToken);
        return Ok(notifications);
    }

    [HttpPut("{id}/mark-read")]
    public async Task<ActionResult<NotificationDto>> MarkAsRead(Guid id, CancellationToken cancellationToken)
    {
        var notification = await _notificationService.MarkAsReadAsync(id, _requestContext.TenantId, _requestContext.UserId, cancellationToken);
        return Ok(notification);
    }
}
