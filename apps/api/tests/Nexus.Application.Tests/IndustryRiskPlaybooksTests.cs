using Nexus.Domain.Entities;
using Nexus.Infrastructure.Services;

namespace Nexus.Application.Tests;

public class IndustryRiskPlaybooksTests
{
    private readonly TenantOperatingPolicyService _service = new();

    [Theory]
    [InlineData("restaurant_cafe", "price", "approval_required")]
    [InlineData("restaurant_cafe", "location", "allow")]
    [InlineData("coffee_shop", "discount", "approval_required")]
    [InlineData("beach_club", "alcohol", "approval_required")]
    [InlineData("wedding_event", "date", "approval_required")]
    [InlineData("beauty_wellness", "before_after", "approval_required")]
    [InlineData("healthcare_clinic", "health_claim", "approval_required")]
    [InlineData("local_products_shop", "origin_claim", "allow")]
    public void ResolveProfile_applies_sector_risk_defaults(string industry, string signal, string expected)
    {
        var profile = new CompanyProfile
        {
            TenantId = Guid.NewGuid(),
            Industry = industry,
            RiskRules = "{}",
            ContentNeeds = "[]",
            OperatingCapabilities = "[]",
        };

        var resolved = _service.ResolveProfile(profile);

        Assert.True(resolved.RiskRules.TryGetValue(signal, out var decision));
        Assert.Equal(expected, decision);
    }

    [Fact]
    public void ResolveProfile_profile_risk_rules_override_playbook()
    {
        var profile = new CompanyProfile
        {
            TenantId = Guid.NewGuid(),
            Industry = "restaurant_cafe",
            RiskRules = """{"price":"allow","discount":"blocked"}""",
            ContentNeeds = "[]",
            OperatingCapabilities = "[]",
        };

        var resolved = _service.ResolveProfile(profile);

        Assert.Equal("allow", resolved.RiskRules["price"]);
        Assert.Equal("blocked", resolved.RiskRules["discount"]);
    }
}
