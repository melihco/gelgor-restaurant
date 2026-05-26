using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class OfficeBrandProfile : TenantEntity, ISoftDeletable
{
    public Guid OfficeId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string LogoUrl { get; set; } = string.Empty;
    public string BrandColors { get; set; } = string.Empty;
    public string AccentColors { get; set; } = string.Empty;
    public string Contact { get; set; } = string.Empty;
    public string WebsiteUrl { get; set; } = string.Empty;
    public string ReservationUrl { get; set; } = string.Empty;
    public string SocialTemplateStyle { get; set; } = string.Empty;
    public string DefaultCta { get; set; } = string.Empty;
    public string Configuration { get; set; } = "{}";
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Office? Office { get; set; }
}
