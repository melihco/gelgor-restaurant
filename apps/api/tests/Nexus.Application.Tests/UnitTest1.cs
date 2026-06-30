using Nexus.Application.Security;

namespace Nexus.Application.Tests;

public class Pbkdf2PasswordHasherTests
{
    [Fact]
    public void HashPassword_ReturnsExpectedVersionedFormat()
    {
        var hash = Pbkdf2PasswordHasher.HashPassword("correct horse battery staple");

        var parts = hash.Split('.');

        Assert.Equal(4, parts.Length);
        Assert.Equal("pbkdf2-sha256", parts[0]);
        Assert.True(int.Parse(parts[1]) >= 200_000);
        Assert.False(string.IsNullOrWhiteSpace(parts[2]));
        Assert.False(string.IsNullOrWhiteSpace(parts[3]));
    }

    [Fact]
    public void VerifyPassword_ReturnsTrueForMatchingPassword()
    {
        var hash = Pbkdf2PasswordHasher.HashPassword("s3cret!");

        Assert.True(Pbkdf2PasswordHasher.VerifyPassword("s3cret!", hash));
    }

    [Fact]
    public void VerifyPassword_ReturnsFalseForWrongPassword()
    {
        var hash = Pbkdf2PasswordHasher.HashPassword("s3cret!");

        Assert.False(Pbkdf2PasswordHasher.VerifyPassword("wrong", hash));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-hash")]
    [InlineData("pbkdf2-sha256.not-int.salt.key")]
    [InlineData("bcrypt.10.salt.key")]
    public void VerifyPassword_ReturnsFalseForInvalidHashFormat(string invalidHash)
    {
        Assert.False(Pbkdf2PasswordHasher.VerifyPassword("password", invalidHash));
    }
}