using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Api.Services;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class IntegrationsController : ControllerBase
{
    private readonly IIntegrationService _integrationService;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;
    private readonly IIntegrationTokenService _tokenService;
    private readonly NexusDbContext _db;

    public IntegrationsController(
        IIntegrationService integrationService,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IRequestContext requestContext,
        IPermissionService permissionService,
        IIntegrationTokenService tokenService,
        NexusDbContext db)
    {
        _integrationService = integrationService;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _requestContext = requestContext;
        _permissionService = permissionService;
        _tokenService = tokenService;
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<IntegrationConnectionDto>>> GetConnections(CancellationToken cancellationToken)
    {
        var connections = await _integrationService.GetConnectionsAsync(_requestContext.TenantId, cancellationToken);
        return Ok(connections);
    }

    [HttpPost]
    public async Task<ActionResult<IntegrationConnectionDto>> CreateConnection([FromBody] CreateIntegrationRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        var securedRequest = request with
        {
            AccessToken = _tokenService.Protect(request.AccessToken),
            RefreshToken = _tokenService.Protect(request.RefreshToken)
        };
        var connection = await _integrationService.CreateConnectionAsync(_requestContext.TenantId, securedRequest, cancellationToken);
        return CreatedAtAction(nameof(GetConnections), connection);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<IntegrationConnectionDto>> UpdateConnection(Guid id, [FromBody] UpdateIntegrationRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        if (!await ConnectionBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        var securedRequest = request with
        {
            AccessToken = request.AccessToken == null ? null : _tokenService.Protect(request.AccessToken),
            RefreshToken = request.RefreshToken == null ? null : _tokenService.Protect(request.RefreshToken)
        };
        var connection = await _integrationService.UpdateConnectionAsync(id, securedRequest, cancellationToken);
        return Ok(connection);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteConnection(Guid id, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        if (!await ConnectionBelongsToTenantAsync(id, cancellationToken))
            return NotFound();

        await _integrationService.DeleteConnectionAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpGet("mappings")]
    public async Task<ActionResult<List<ProviderAccountMappingDto>>> GetMappings(CancellationToken cancellationToken)
    {
        var mappings = await _integrationService.GetMappingsAsync(_requestContext.TenantId, cancellationToken);
        return Ok(mappings);
    }

    [HttpPost("mappings")]
    public async Task<ActionResult<ProviderAccountMappingDto>> SetMapping([FromBody] SetProviderMappingRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        if (!await ConnectionBelongsToTenantAsync(request.IntegrationConnectionId, cancellationToken))
            return BadRequest(new { error = "Integration connection does not belong to current tenant." });

        var mapping = await _integrationService.SetMappingAsync(_requestContext.TenantId, request, cancellationToken);
        return Ok(mapping);
    }

    // ── Google OAuth Flow ─────────────────────────────────────────────────────

    [HttpGet("google/auth-url")]
    public async Task<ActionResult<GoogleAuthUrlResponse>> GetGoogleAuthUrl([FromQuery] string scopes = "ads,analytics,search_console", CancellationToken cancellationToken = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        var clientId = _configuration["Google:OAuth:ClientId"] ?? "";
        var redirectUri = _configuration["Google:OAuth:RedirectUri"]
            ?? "http://localhost:5050/api/integrations/google/callback";

        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { error = "Google OAuth is not configured. Set Google:OAuth:ClientId." });

        var scopeList = new List<string>();
        var scopeParts = scopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var s in scopeParts)
        {
            switch (s.ToLowerInvariant())
            {
                case "ads":
                    scopeList.Add("https://www.googleapis.com/auth/adwords");
                    break;
                case "analytics":
                    scopeList.Add("https://www.googleapis.com/auth/analytics.readonly");
                    break;
                case "search_console":
                    scopeList.Add("https://www.googleapis.com/auth/webmasters.readonly");
                    break;
            }
        }

        scopeList.Add("openid");
        scopeList.Add("email");

        var state = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(
            System.Text.Json.JsonSerializer.Serialize(new
            {
                tenantId = _requestContext.TenantId,
                userId = _requestContext.UserId,
                scopes,
                issuedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            })));

        var authUrl = $"https://accounts.google.com/o/oauth2/v2/auth" +
            $"?client_id={Uri.EscapeDataString(clientId)}" +
            $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
            $"&response_type=code" +
            $"&scope={Uri.EscapeDataString(string.Join(" ", scopeList))}" +
            $"&access_type=offline" +
            $"&prompt=consent" +
            $"&state={Uri.EscapeDataString(state)}";

        return Ok(new GoogleAuthUrlResponse(authUrl, string.Join(",", scopeParts)));
    }

    [HttpGet("google/callback")]
    public async Task<ActionResult> GoogleOAuthCallback(
        [FromQuery] string code,
        [FromQuery] string state,
        CancellationToken cancellationToken)
    {
        var clientId = _configuration["Google:OAuth:ClientId"] ?? "";
        var clientSecret = _configuration["Google:OAuth:ClientSecret"] ?? "";
        var redirectUri = _configuration["Google:OAuth:RedirectUri"]
            ?? "http://localhost:5050/api/integrations/google/callback";

        using var httpClient = new HttpClient();
        var tokenResponse = await httpClient.PostAsync(
            "https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["redirect_uri"] = redirectUri,
                ["grant_type"] = "authorization_code",
            }),
            cancellationToken);

        if (!tokenResponse.IsSuccessStatusCode)
        {
            var error = await tokenResponse.Content.ReadAsStringAsync(cancellationToken);
            return BadRequest(new { error = "Token exchange failed", details = error });
        }

        var tokenJson = await tokenResponse.Content.ReadFromJsonAsync<GoogleTokenResponse>(cancellationToken: cancellationToken);

        // Parse state to get requested scopes
        Guid tenantId = _requestContext.TenantId;
        var requestedScopes = "ads,analytics,search_console";
        try
        {
            var stateBytes = Convert.FromBase64String(state);
            var stateObj = System.Text.Json.JsonDocument.Parse(stateBytes);
            if (stateObj.RootElement.TryGetProperty("scopes", out var scopesEl))
                requestedScopes = scopesEl.GetString() ?? requestedScopes;
            if (stateObj.RootElement.TryGetProperty("tenantId", out var tenantEl) &&
                Guid.TryParse(tenantEl.GetString(), out var parsedTenant))
                tenantId = parsedTenant;
        }
        catch { }

        var scopeParts = requestedScopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var created = new List<string>();

        foreach (var scope in scopeParts)
        {
            IntegrationProvider provider = scope.ToLowerInvariant() switch
            {
                "ads" => IntegrationProvider.GoogleAds,
                "analytics" => IntegrationProvider.GoogleAnalytics,
                "search_console" => IntegrationProvider.SearchConsole,
                _ => IntegrationProvider.GoogleBusiness,
            };

            string displayName = scope.ToLowerInvariant() switch
            {
                "ads" => "Google Ads",
                "analytics" => "Google Analytics 4",
                "search_console" => "Search Console",
                _ => "Google",
            };

            await _integrationService.CreateConnectionAsync(tenantId, new CreateIntegrationRequest(
                Provider: provider,
                AccountId: tokenJson?.Email ?? "oauth",
                DisplayName: displayName,
                AccessToken: _tokenService.Protect(tokenJson?.AccessToken ?? ""),
                RefreshToken: _tokenService.Protect(tokenJson?.RefreshToken ?? ""),
                Scopes: scope
            ), cancellationToken);

            created.Add(displayName);
        }

        var frontendUrl = _configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
        return Redirect($"{frontendUrl}/setup?google_connected={string.Join(",", created)}");
    }

    // ── Ads Data Proxy ────────────────────────────────────────────────────────

    [HttpGet("ads/campaigns")]
    public async Task<ActionResult> GetAdsCampaigns(
        [FromQuery] string dateRange = "LAST_30_DAYS",
        CancellationToken cancellationToken = default)
    {
        var connections = await _integrationService.GetConnectionsAsync(_requestContext.TenantId, cancellationToken);
        var adsConnection = connections.FirstOrDefault(c => c.Provider == IntegrationProvider.GoogleAds);
        var client = _httpClientFactory.CreateClient("CrewService");
        var path = $"/api/v1/ads/campaigns?date_range={Uri.EscapeDataString(dateRange)}";

        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(8));
            using var response = await client.GetAsync(path, timeoutCts.Token);
            var body = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            if (response.IsSuccessStatusCode)
                return Content(body, "application/json");
        }
        catch
        {
            // Fall back to connection metadata below so the UI can still render safely.
        }

        return Ok(new
        {
            campaigns = Array.Empty<object>(),
            total_cost = 0,
            total_conversions = 0,
            total_clicks = 0,
            connected = adsConnection != null,
            account_id = adsConnection?.AccountId ?? "",
            date_range = dateRange,
            source = "proxy-fallback"
        });
    }

    [HttpGet("analytics/summary")]
    public async Task<ActionResult> GetAnalyticsSummary(
        [FromQuery] string dateRange = "LAST_30_DAYS",
        CancellationToken cancellationToken = default)
    {
        var connections = await _integrationService.GetConnectionsAsync(_requestContext.TenantId, cancellationToken);
        var gaConnection = connections.FirstOrDefault(c => c.Provider == IntegrationProvider.GoogleAnalytics);
        var scConnection = connections.FirstOrDefault(c => c.Provider == IntegrationProvider.SearchConsole);

        return Ok(new
        {
            analyticsConnected = gaConnection != null,
            searchConsoleConnected = scConnection != null,
            dateRange,
        });
    }

    [HttpGet("analytics/dashboard")]
    public async Task<ActionResult> GetAnalyticsDashboard(
        [FromQuery] string dateRange = "30daysAgo",
        CancellationToken cancellationToken = default)
    {
        var client = _httpClientFactory.CreateClient("CrewService");
        var path = $"/api/v1/analytics/dashboard?date_range={Uri.EscapeDataString(dateRange)}";

        try
        {
            using var response = await client.GetAsync(path, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return StatusCode((int)response.StatusCode, new
                {
                    error = "Analytics dashboard proxy failed",
                    upstreamStatus = (int)response.StatusCode,
                    details = body,
                });
            }

            return Content(body, "application/json");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new
            {
                error = "Analytics dashboard service unavailable",
                details = ex.Message,
            });
        }
    }

    [HttpGet("canva/token")]
    public async Task<ActionResult<CanvaTokenStoreResponse>> GetCanvaToken(CancellationToken cancellationToken = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        var connection = await _db.IntegrationConnections
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == _requestContext.TenantId && c.Provider == IntegrationProvider.Canva, cancellationToken);

        if (connection == null || string.IsNullOrWhiteSpace(connection.EncryptedAccessToken))
            return NotFound(new { error = "Canva token is not stored for this tenant." });

        return Ok(new CanvaTokenStoreResponse(
            _tokenService.Unprotect(connection.EncryptedAccessToken),
            _tokenService.Unprotect(connection.EncryptedRefreshToken),
            "Bearer",
            connection.TokenExpiresAt,
            connection.Scopes));
    }

    [HttpPut("canva/token")]
    public async Task<ActionResult> UpsertCanvaToken([FromBody] CanvaTokenStoreRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.AccessToken))
            return BadRequest(new { error = "accessToken is required." });

        var connection = await _db.IntegrationConnections
            .FirstOrDefaultAsync(c => c.TenantId == _requestContext.TenantId && c.Provider == IntegrationProvider.Canva, cancellationToken);

        if (connection == null)
        {
            connection = new IntegrationConnection
            {
                TenantId = _requestContext.TenantId,
                Provider = IntegrationProvider.Canva,
                AccountId = "canva",
                DisplayName = "Canva",
            };
            _db.IntegrationConnections.Add(connection);
        }

        connection.Status = IntegrationStatus.Connected;
        connection.Scopes = request.Scope ?? string.Empty;
        connection.EncryptedAccessToken = _tokenService.Protect(request.AccessToken);
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
            connection.EncryptedRefreshToken = _tokenService.Protect(request.RefreshToken);
        connection.TokenExpiresAt = request.ExpiresAt ?? DateTime.UtcNow.AddSeconds(Math.Max(60, request.ExpiresIn ?? 3600));
        connection.LastHealthCheck = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(new { provider = "Canva", status = "Connected", connection.TokenExpiresAt });
    }

    private Task<bool> ConnectionBelongsToTenantAsync(Guid connectionId, CancellationToken cancellationToken)
    {
        return _db.IntegrationConnections.AnyAsync(
            connection => connection.Id == connectionId && connection.TenantId == _requestContext.TenantId,
            cancellationToken);
    }
}

public record GoogleAuthUrlResponse(string AuthUrl, string RequestedScopes);

public record CanvaTokenStoreRequest(
    string AccessToken,
    string? RefreshToken,
    int? ExpiresIn,
    DateTime? ExpiresAt,
    string? Scope);

public record CanvaTokenStoreResponse(
    string AccessToken,
    string? RefreshToken,
    string TokenType,
    DateTime? ExpiresAt,
    string? Scope);

public record GoogleTokenResponse
{
    public string? AccessToken { get; init; }
    public string? RefreshToken { get; init; }
    public string? TokenType { get; init; }
    public int ExpiresIn { get; init; }
    public string? Scope { get; init; }
    public string? IdToken { get; init; }
    public string? Email { get; init; }
}

