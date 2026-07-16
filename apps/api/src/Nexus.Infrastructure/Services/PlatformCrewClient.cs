using System.Net.Http;
using Nexus.Application.Services;

namespace Nexus.Infrastructure.Services;

/// <summary>
/// Proxies Super Admin platform routes to Python crew.
/// HttpClient is configured in Program.cs (same BaseUrl + X-Internal-Api-Key as CrewService).
/// </summary>
public sealed class PlatformCrewClient : IPlatformCrewClient
{
    private readonly HttpClient _httpClient;

    public PlatformCrewClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string relativePath,
        Guid workspaceId,
        HttpContent? content = null,
        CancellationToken cancellationToken = default)
    {
        var path = relativePath.StartsWith('/') ? relativePath : "/" + relativePath;

        using var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-Tenant-Id", workspaceId.ToString("D"));
        if (content is not null)
            request.Content = content;

        return await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);
    }
}
