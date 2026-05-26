using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class IntegrationConnection : TenantEntity
{
    public IntegrationProvider Provider { get; set; }
    public string AccountId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public IntegrationStatus Status { get; set; } = IntegrationStatus.Disconnected;
    public string Scopes { get; set; } = string.Empty;
    public string EncryptedAccessToken { get; set; } = string.Empty;
    public string EncryptedRefreshToken { get; set; } = string.Empty;
    public DateTime? TokenExpiresAt { get; set; }
    public DateTime? LastHealthCheck { get; set; }
    public string Configuration { get; set; } = "{}";

    public ICollection<ProviderAccountMapping> AccountMappings { get; set; } = new List<ProviderAccountMapping>();
}
