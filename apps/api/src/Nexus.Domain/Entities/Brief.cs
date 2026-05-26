using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class Brief : TenantEntity, ISoftDeletable
{
    public Guid CreatedByUserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RawContent { get; set; } = string.Empty;
    public BriefStatus Status { get; set; } = BriefStatus.Draft;
    public DateTime? SubmittedAt { get; set; }
    public DateTime? DecomposedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public User? CreatedByUser { get; set; }
    public ICollection<BriefAttachment> Attachments { get; set; } = new List<BriefAttachment>();
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}
