using Microsoft.AspNetCore.DataProtection;

namespace Nexus.Api.Services;

public interface IIntegrationTokenService
{
    string Protect(string token);
    string Unprotect(string protectedToken);
}

public sealed class IntegrationTokenService : IIntegrationTokenService
{
    private readonly IDataProtector _protector;

    public IntegrationTokenService(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector("SmartAgency.IntegrationTokens.v1");
    }

    public string Protect(string token)
        => string.IsNullOrWhiteSpace(token) ? string.Empty : _protector.Protect(token);

    public string Unprotect(string protectedToken)
    {
        if (string.IsNullOrWhiteSpace(protectedToken))
            return string.Empty;

        try
        {
            return _protector.Unprotect(protectedToken);
        }
        catch
        {
            // Existing development rows may contain plaintext tokens from before encryption.
            return protectedToken;
        }
    }
}
