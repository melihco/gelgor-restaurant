using Nexus.Application.Services;

namespace Nexus.Application.Tests;

public class DerivedAdCreativeTests
{
    [Theory]
    [InlineData("""{"derived_from":"designed_post","ad_platform":"meta_ads"}""")]
    [InlineData("""{"ad_creative":true}""")]
    [InlineData("""{"ad_creative":"true"}""")]
    [InlineData("""{"production_role":"paid_ad_creative"}""")]
    [InlineData("""{"production_role":"paid_ad_google_creative"}""")]
    [InlineData("""{"pipeline":"meta_ad"}""")]
    [InlineData("""{"pipeline":"google_ad"}""")]
    [InlineData("""{"publish_channel":"meta_ads"}""")]
    [InlineData("""{"publish_channel":"google_ads"}""")]
    [InlineData("""{"ad_platform":"google_ads"}""")]
    public void IsClone_DerivedAds(string json)
    {
        Assert.True(DerivedAdCreative.IsClone(json));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("{}")]
    [InlineData("""{"catalog_slot_key":"local_products_shop_product_hero_post","pipeline":"fal_design"}""")]
    [InlineData("""{"production_role":"fal_designed_post","publish_channel":"instagram_organic"}""")]
    [InlineData("not-json")]
    public void IsClone_OrganicPosts(string? json)
    {
        Assert.False(DerivedAdCreative.IsClone(json));
    }
}
