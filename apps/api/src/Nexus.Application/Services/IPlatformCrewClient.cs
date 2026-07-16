using System.Net.Http;

namespace Nexus.Application.Services;

/// <summary>
/// Thin HTTP proxy to Python crew (/api/v1/...).
/// Reuses the named "CrewService" client (BaseUrl + X-Internal-Api-Key)
/// and always sets X-Tenant-Id to the path workspace so Python IDOR checks pass.
/// </summary>
public interface IPlatformCrewClient
{
    Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string relativePath,
        Guid workspaceId,
        HttpContent? content = null,
        CancellationToken cancellationToken = default);
}
