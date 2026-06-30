using Nexus.Application.Services;
using Nexus.Domain.Entities;

namespace Nexus.Application.Tests;

public class CrewBrandContextFactoryTests
{
    [Fact]
    public void Build_WithNullProfile_UsesTenantOfficeDefaults()
    {
        var tenant = new Tenant { Name = "Acme", Plan = "pro" };
        var office = new Office { Name = "Istanbul Office", Description = "main office" };

        var ctx = CrewBrandContextFactory.Build(tenant, office, new List<BrandMemoryDocument>(), null, "");

        Assert.Equal("Istanbul Office", ctx.BusinessName); // profile null -> office name
        Assert.Equal("tr", ctx.Languages);
        Assert.Contains("pro", ctx.Keywords); // tenant plan seeds keywords
    }

    [Fact]
    public void Build_AppendsPromptEnrichmentToCustomRules()
    {
        var tenant = new Tenant { Name = "Acme", Plan = "pro" };

        var ctx = CrewBrandContextFactory.Build(tenant, null, new List<BrandMemoryDocument>(), null, "Be concise.");

        Assert.Equal("Be concise.", ctx.CustomRules);
    }

    [Fact]
    public void Build_WithProfile_PrefersProfileValues()
    {
        var tenant = new Tenant { Name = "Acme", Plan = "pro" };
        var profile = new CompanyProfile
        {
            BrandName = "Lux Bistro",
            Industry = "Restaurant",
            Location = "Kadıköy",
            Languages = "en",
        };

        var ctx = CrewBrandContextFactory.Build(tenant, null, new List<BrandMemoryDocument>(), profile, "");

        Assert.Equal("Lux Bistro", ctx.BusinessName);
        Assert.Equal("en", ctx.Languages);
        Assert.Contains("Restaurant", ctx.Keywords);
        Assert.Contains("Kadıköy", ctx.Keywords);
    }
}
