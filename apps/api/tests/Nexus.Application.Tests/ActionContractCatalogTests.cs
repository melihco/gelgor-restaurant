using Nexus.Application.Services;
using Nexus.Domain.Enums;

namespace Nexus.Application.Tests;

public class ActionContractCatalogTests
{
    private readonly ActionContractCatalog _catalog = new();

    [Fact]
    public void ValidatePayload_UnknownAction_Fails()
    {
        var result = _catalog.ValidatePayload("does_not_exist", IntegrationProvider.Instagram, "{}");

        Assert.False(result.Success);
        Assert.Contains("Bilinmeyen", result.Message);
    }

    [Fact]
    public void ValidatePayload_ProviderMismatch_Fails()
    {
        // reply_to_google_review expects GoogleBusiness
        var result = _catalog.ValidatePayload(
            "reply_to_google_review",
            IntegrationProvider.GoogleAds,
            "{\"reply_text\":\"hi\"}");

        Assert.False(result.Success);
        Assert.Contains("uyumsuz", result.Message);
    }

    [Fact]
    public void ValidatePayload_InvalidJson_Fails()
    {
        var result = _catalog.ValidatePayload("log_review_analysis", IntegrationProvider.GoogleBusiness, "not json");

        Assert.False(result.Success);
        Assert.Contains("geçerli JSON", result.Message);
    }

    [Fact]
    public void ValidatePayload_NonObject_Fails()
    {
        var result = _catalog.ValidatePayload("log_review_analysis", IntegrationProvider.GoogleBusiness, "[1,2,3]");

        Assert.False(result.Success);
        Assert.Contains("object", result.Message);
    }

    [Fact]
    public void ValidatePayload_MissingRequiredKey_Fails()
    {
        var result = _catalog.ValidatePayload("reply_to_google_review", IntegrationProvider.GoogleBusiness, "{}");

        Assert.False(result.Success);
        Assert.Contains("eksik", result.Message);
    }

    [Fact]
    public void ValidatePayload_Valid_Succeeds()
    {
        var result = _catalog.ValidatePayload(
            "reply_to_google_review",
            IntegrationProvider.GoogleBusiness,
            "{\"reply_text\":\"Teşekkürler\"}");

        Assert.True(result.Success);
    }

    [Theory]
    [InlineData("reply_to_google_review", true)]
    [InlineData("create_instagram_content_plan", true)]
    [InlineData("create_weekly_content_strategy", false)] // live not supported
    [InlineData("generic_output", false)]
    [InlineData("unknown_action", false)]
    public void IsLiveSupported_MatchesContract(string actionType, bool expected)
    {
        Assert.Equal(expected, _catalog.IsLiveSupported(actionType));
    }

    [Fact]
    public void GetSupportMatrix_ExposesAllContracts()
    {
        var matrix = _catalog.GetSupportMatrix();

        Assert.Equal(10, matrix.Count);

        var googleReview = matrix.Single(m => m.ActionType == "reply_to_google_review");
        Assert.Equal("GoogleBusiness", googleReview.Provider);
        Assert.True(googleReview.LiveSupported);
        Assert.Contains("reply_text", googleReview.RequiredPayloadFields);

        // null provider surfaces as "Internal"
        var reviewLog = matrix.Single(m => m.ActionType == "log_review_analysis");
        Assert.Equal("Internal", reviewLog.Provider);
    }
}
