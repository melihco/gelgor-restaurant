using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Nexus.Application.Security;
using Nexus.Domain.Entities;

namespace Nexus.Api.Services;

public interface ILocalAuthService
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string passwordHash);
    string CreateSessionToken(User user, Guid officeId);
    bool TryValidateToken(string token, out ClaimsPrincipal principal);
    void AppendSessionCookie(HttpResponse response, string token);
    void ClearSessionCookie(HttpResponse response);
}

public sealed class LocalAuthService : ILocalAuthService
{
    public const string SessionCookieName = "sa_session";
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public LocalAuthService(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    public string HashPassword(string password) => Pbkdf2PasswordHasher.HashPassword(password);

    public bool VerifyPassword(string password, string passwordHash) =>
        Pbkdf2PasswordHasher.VerifyPassword(password, passwordHash);

    public string CreateSessionToken(User user, Guid officeId)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(_configuration.GetValue<int?>("Auth:SessionMinutes") ?? 60 * 12);
        var header = new Dictionary<string, object>
        {
            ["alg"] = "HS256",
            ["typ"] = "JWT"
        };
        var payload = new Dictionary<string, object?>
        {
            ["sub"] = user.Id.ToString(),
            [ClaimTypes.NameIdentifier] = user.Id.ToString(),
            ["tenant_id"] = user.TenantId.ToString(),
            ["office_id"] = officeId.ToString(),
            [ClaimTypes.Email] = user.Email,
            [ClaimTypes.Role] = user.Role,
            ["name"] = user.DisplayName,
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = expiresAt.ToUnixTimeSeconds()
        };

        var unsignedToken = $"{Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header))}.{Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload))}";
        var signature = Sign(unsignedToken);
        return $"{unsignedToken}.{signature}";
    }

    public bool TryValidateToken(string token, out ClaimsPrincipal principal)
    {
        principal = new ClaimsPrincipal(new ClaimsIdentity());
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3)
                return false;

            var unsignedToken = $"{parts[0]}.{parts[1]}";
            var expectedSignature = Sign(unsignedToken);
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(expectedSignature),
                    Encoding.UTF8.GetBytes(parts[2])))
                return false;

            using var payloadDoc = JsonDocument.Parse(Base64UrlDecode(parts[1]));
            var payload = payloadDoc.RootElement;
            if (!payload.TryGetProperty("exp", out var expElement))
                return false;

            long expUnix = expElement.ValueKind switch
            {
                JsonValueKind.Number => expElement.GetInt64(),
                JsonValueKind.String when long.TryParse(expElement.GetString(), out var s) => s,
                _ => 0
            };
            if (expUnix == 0 || DateTimeOffset.FromUnixTimeSeconds(expUnix) <= DateTimeOffset.UtcNow)
                return false;

            var claims = new List<Claim>();
            foreach (var property in payload.EnumerateObject())
            {
                if (property.Value.ValueKind is JsonValueKind.String)
                    claims.Add(new Claim(property.Name, property.Value.GetString() ?? string.Empty));
            }

            principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "SmartAgencyLocalJwt"));
            return true;
        }
        catch
        {
            // Bozuk JWT, imza anahtarı eksikliği (TryValidateToken yolunda throw etme — 500 önlenir)
            return false;
        }
    }

    public void AppendSessionCookie(HttpResponse response, string token)
    {
        response.Cookies.Append(SessionCookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Expires = DateTimeOffset.UtcNow.AddMinutes(_configuration.GetValue<int?>("Auth:SessionMinutes") ?? 60 * 12),
            Path = "/"
        });
    }

    public void ClearSessionCookie(HttpResponse response)
    {
        response.Cookies.Delete(SessionCookieName, new CookieOptions
        {
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/"
        });
    }

    private string Sign(string value)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(GetSigningKey()));
        return Base64UrlEncode(hmac.ComputeHash(Encoding.UTF8.GetBytes(value)));
    }

    private string GetSigningKey()
    {
        var key = _configuration["Auth:JwtSecret"];
        if (!string.IsNullOrWhiteSpace(key))
            return key;

        if (!_environment.IsDevelopment())
            throw new InvalidOperationException("Auth:JwtSecret must be configured outside development.");

        return "smartagency-local-dev-jwt-secret-change-before-production";
    }

    private static string Base64UrlEncode(byte[] value)
        => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }
}

