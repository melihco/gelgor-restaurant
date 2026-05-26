using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class CanvaTemplateAssignment : TenantEntity, ISoftDeletable
{
    public Guid? OfficeId { get; set; }
    public string CanvaTemplateId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ContentKinds { get; set; } = "[]";
    public string UseCases { get; set; } = "[]";
    public string TemplateFamilyId { get; set; } = string.Empty;
    public string AllowedIntents { get; set; } = "[]";
    public string AllowedChannels { get; set; } = "[]";
    public string RequiredAssetIntents { get; set; } = "[]";
    public string RiskTier { get; set; } = "low";
    public string Status { get; set; } = "draft";
    public bool ManualApprovalRequired { get; set; }
    public DateTime? LastReviewedAt { get; set; }
    public Guid? LastReviewedBy { get; set; }
    public string AspectRatio { get; set; } = "freeform";
    public string DatasetContract { get; set; } = "{}";
    public bool Enabled { get; set; } = true;
    public int Priority { get; set; }
    public int BrandFitScore { get; set; }
    public string Notes { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Office? Office { get; set; }
}
