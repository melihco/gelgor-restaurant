using System.Security.Cryptography;
using System.Text;

namespace Nexus.Application.Security;

/// <summary>PBKDF2-SHA256 password format used by <c>LocalAuthService</c> and database seeding.</summary>
public static class Pbkdf2PasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 210_000;

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            KeySize);

        return $"pbkdf2-sha256.{Iterations}.{Base64UrlEncode(salt)}.{Base64UrlEncode(key)}";
    }

    public static bool VerifyPassword(string password, string passwordHash)
    {
        var parts = passwordHash.Split('.');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha256")
            return false;

        if (!int.TryParse(parts[1], out var iterations))
            return false;

        var salt = Base64UrlDecode(parts[2]);
        var expected = Base64UrlDecode(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expected.Length);

        return CryptographicOperations.FixedTimeEquals(actual, expected);
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
