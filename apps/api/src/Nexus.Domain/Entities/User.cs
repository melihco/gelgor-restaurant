using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class User : TenantEntity, ISoftDeletable
{
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Role { get; set; } = "User";
    public string PasswordHash { get; set; } = string.Empty;
    public DateTime? EmailVerifiedAt { get; set; }
    public DateTime? InvitedAt { get; set; }
    public DateTime? InviteAcceptedAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Tenant? Tenant { get; set; }
    public ICollection<Brief> CreatedBriefs { get; set; } = new List<Brief>();
    public ICollection<ReviewDecision> ReviewDecisions { get; set; } = new List<ReviewDecision>();
    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
}
