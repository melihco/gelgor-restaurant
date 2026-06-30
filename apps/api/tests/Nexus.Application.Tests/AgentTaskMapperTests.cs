using System.Text.Json;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Application.Tests;

public class AgentTaskMapperTests
{
    private static Agent Agent(AgentType type = AgentType.InstagramContentGenerator, string display = "Gram Master")
        => new() { AgentType = type, DisplayName = display };

    [Theory]
    [InlineData(AgentType.CustomerReviewResponder, "review_agent")]
    [InlineData(AgentType.ChatbotManager, "review_agent")]
    [InlineData(AgentType.ContentStrategy, "content_strategy_agent")]
    [InlineData(AgentType.InstagramContentGenerator, "content_agent")]
    [InlineData(AgentType.BlogWriter, "content_agent")]
    [InlineData(AgentType.AnalyticsAnalyst, "analytics_agent")]
    [InlineData(AgentType.GoogleAdsAnalyst, "ads_agent")]
    [InlineData(AgentType.AiCeo, "ads_agent")]
    public void MapAgentRole_MapsToCrewRole(AgentType type, string expected)
    {
        Assert.Equal(expected, AgentTaskMapper.MapAgentRole(type));
    }

    [Fact]
    public void ResolveTaskType_PrefersExplicitRequest()
    {
        Assert.Equal("custom_task", AgentTaskMapper.ResolveTaskType(AgentType.InstagramContentGenerator, "custom_task"));
    }

    [Theory]
    [InlineData(AgentType.CustomerReviewResponder, "single_review_response")]
    [InlineData(AgentType.ContentStrategy, "content_strategy")]
    [InlineData(AgentType.InstagramContentGenerator, "content_ideation")]
    [InlineData(AgentType.AnalyticsAnalyst, "traffic_analysis")]
    [InlineData(AgentType.GoogleAdsAnalyst, "campaign_analysis")]
    public void ResolveTaskType_FallsBackToDefaultPerAgentType(AgentType type, string expected)
    {
        Assert.Equal(expected, AgentTaskMapper.ResolveTaskType(type, null));
    }

    [Theory]
    [InlineData(true, ApprovalMode.AutoExecute, false)]
    [InlineData(false, ApprovalMode.SuggestOnly, true)]
    [InlineData(false, ApprovalMode.SuggestAndWait, true)]
    [InlineData(true, null, true)]   // null mode -> passthrough of crew flag
    [InlineData(false, null, false)]
    public void ResolveApprovalRequired_RespectsMode(bool crewFlag, ApprovalMode? mode, bool expected)
    {
        Assert.Equal(expected, AgentTaskMapper.ResolveApprovalRequired(crewFlag, mode));
    }

    [Theory]
    [InlineData("instagram", "anything", IntegrationProvider.Instagram)]
    [InlineData("google_ads", "anything", IntegrationProvider.GoogleAds)]
    [InlineData("system", "reply_to_google_review", IntegrationProvider.GoogleBusiness)]
    [InlineData("system", "log_analytics_report", IntegrationProvider.GoogleAnalytics)]
    public void ResolveIntegrationProvider_Resolves(string provider, string actionType, IntegrationProvider expected)
    {
        Assert.Equal(expected, AgentTaskMapper.ResolveIntegrationProvider(provider, actionType));
    }

    [Fact]
    public void ResolveIntegrationProvider_UnknownReturnsNull()
    {
        Assert.Null(AgentTaskMapper.ResolveIntegrationProvider("mystery", "mystery_action"));
    }

    [Theory]
    [InlineData("make_reel_video", 12)]
    [InlineData("content_ideation", 8)]
    [InlineData("single_review_response", 6)]
    public void EstimateTaskDurationMinutes_ByTaskShape(string taskType, int expected)
    {
        Assert.Equal(expected, AgentTaskMapper.EstimateTaskDurationMinutes(AgentType.InstagramContentGenerator, taskType));
    }

    [Fact]
    public void EstimateTaskDurationMinutes_AnalystShorterDefault()
    {
        Assert.Equal(7, AgentTaskMapper.EstimateTaskDurationMinutes(AgentType.AnalyticsAnalyst, "anything"));
        Assert.Equal(4, AgentTaskMapper.EstimateTaskDurationMinutes(AgentType.CustomerReviewResponder, "anything"));
    }

    [Theory]
    [InlineData("review_response", ArtifactType.ReviewResponse)]
    [InlineData("blog_post", ArtifactType.BlogPost)]
    [InlineData("ad_copy", ArtifactType.AdCopy)]
    public void MapArtifactType_ExplicitMapping(string artifactType, ArtifactType expected)
    {
        Assert.Equal(expected, AgentTaskMapper.MapArtifactType(AgentType.InstagramContentGenerator, artifactType));
    }

    [Fact]
    public void MapArtifactType_FallsBackToAgentType()
    {
        Assert.Equal(ArtifactType.InstagramCaption, AgentTaskMapper.MapArtifactType(AgentType.InstagramContentGenerator, "unrecognized"));
        Assert.Equal(ArtifactType.ReviewResponse, AgentTaskMapper.MapArtifactType(AgentType.ChatbotManager, "unrecognized"));
    }

    [Fact]
    public void BuildBriefTitle_UsesReviewerNameWhenPresent()
    {
        var input = JsonSerializer.SerializeToElement(new { reviewerName = "Ali" });
        Assert.Equal("Review response for Ali", AgentTaskMapper.BuildBriefTitle(Agent(), input));
    }

    [Fact]
    public void BuildBriefTitle_FallsBackToDisplayName()
    {
        Assert.Equal("Gram Master execution", AgentTaskMapper.BuildBriefTitle(Agent(), null));
    }

    [Fact]
    public void BuildTaskTitle_FormatsTaskType()
    {
        Assert.Equal("Gram Master: content ideation", AgentTaskMapper.BuildTaskTitle(Agent(), "content_ideation"));
    }

    [Fact]
    public void BuildArtifactContentFallback_PassesThroughContent()
    {
        Assert.Equal("real content", AgentTaskMapper.BuildArtifactContentFallback("real content", Agent(), "content_ideation"));
    }

    [Fact]
    public void BuildArtifactContentFallback_GeneratesPlaceholderWhenEmpty()
    {
        var result = AgentTaskMapper.BuildArtifactContentFallback("  ", Agent(), "content_ideation");
        Assert.Contains("Gram Master", result);
        Assert.Contains("content_ideation", result);
    }
}
