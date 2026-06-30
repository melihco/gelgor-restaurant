using System.Text.Json;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Application.Services;

/// <summary>
/// Pure, stateless mapping/resolution helpers used when delegating an agent run
/// to the CrewAI orchestration service: agent-type → crew role, default task type,
/// titles/descriptions, artifact-type mapping and action/provider resolution.
///
/// Extracted out of AgentService so this routing logic is cohesive and unit-testable
/// in isolation (no DbContext / orchestration dependencies).
/// </summary>
public static class AgentTaskMapper
{
    public static bool ResolveApprovalRequired(bool crewApprovalRequired, ApprovalMode? defaultApprovalMode)
    {
        return defaultApprovalMode switch
        {
            ApprovalMode.AutoExecute => false,
            ApprovalMode.SuggestOnly or ApprovalMode.SuggestAndWait => true,
            _ => crewApprovalRequired
        };
    }

    public static IntegrationProvider? ResolveIntegrationProvider(string provider, string actionType)
    {
        var normalizedProvider = provider.Trim().ToLowerInvariant();
        var normalizedAction = actionType.Trim().ToLowerInvariant();

        return normalizedProvider switch
        {
            "google_business" => IntegrationProvider.GoogleBusiness,
            "instagram" => IntegrationProvider.Instagram,
            "google_ads" => IntegrationProvider.GoogleAds,
            "google_analytics" or "analytics" => IntegrationProvider.GoogleAnalytics,
            "search_console" => IntegrationProvider.SearchConsole,
            "system" => ResolveSystemActionProvider(normalizedAction),
            _ => ResolveSystemActionProvider(normalizedAction)
        };
    }

    private static IntegrationProvider? ResolveSystemActionProvider(string actionType)
    {
        return actionType switch
        {
            "reply_to_google_review" => IntegrationProvider.GoogleBusiness,
            "create_instagram_content_plan" or "schedule_instagram_posts" or "create_weekly_content_strategy" => IntegrationProvider.Instagram,
            "apply_campaign_recommendations" or "create_ad_creatives" or "apply_budget_optimization" => IntegrationProvider.GoogleAds,
            "log_analytics_report" => IntegrationProvider.GoogleAnalytics,
            _ => null
        };
    }

    public static string MapAgentRole(AgentType agentType)
    {
        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => "review_agent",
            AgentType.ContentStrategy => "content_strategy_agent",
            AgentType.BlogWriter or AgentType.SocialMediaDesigner or AgentType.InstagramContentGenerator
                or AgentType.SeoSpecialist or AgentType.UiUxDesigner or AgentType.VideoEditor => "content_agent",
            AgentType.AnalyticsAnalyst => "analytics_agent",
            AgentType.GoogleAdsAnalyst or AgentType.AiStrategist or AgentType.AiCeo => "ads_agent",
            _ => throw new InvalidOperationException($"Agent type '{agentType}' is not mapped to a CrewAI role yet.")
        };
    }

    public static string ResolveTaskType(AgentType agentType, string? requestedTaskType)
    {
        if (!string.IsNullOrWhiteSpace(requestedTaskType))
        {
            return requestedTaskType;
        }

        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => "single_review_response",
            AgentType.ContentStrategy => "content_strategy",
            AgentType.BlogWriter or AgentType.SocialMediaDesigner or AgentType.InstagramContentGenerator
                or AgentType.SeoSpecialist or AgentType.UiUxDesigner or AgentType.VideoEditor => "content_ideation",
            AgentType.AnalyticsAnalyst => "traffic_analysis",
            AgentType.GoogleAdsAnalyst or AgentType.AiStrategist or AgentType.AiCeo => "campaign_analysis",
            _ => "single_review_response"
        };
    }

    public static string BuildTaskTitle(Agent agent, string taskType)
    {
        return $"{agent.DisplayName}: {taskType.Replace("_", " ")}";
    }

    public static string BuildTaskDescription(Agent agent, string taskType)
    {
        return $"Delegated {taskType.Replace("_", " ")} execution through the internal CrewAI orchestration service for agent {agent.DisplayName}.";
    }

    public static int EstimateTaskDurationMinutes(AgentType agentType, string taskType)
    {
        if (taskType.Contains("video", StringComparison.OrdinalIgnoreCase) ||
            taskType.Contains("reel", StringComparison.OrdinalIgnoreCase))
            return 12;

        if (taskType.Contains("content", StringComparison.OrdinalIgnoreCase) ||
            taskType.Contains("instagram", StringComparison.OrdinalIgnoreCase))
            return 8;

        if (agentType == AgentType.GoogleAdsAnalyst || agentType == AgentType.AnalyticsAnalyst)
            return 7;

        if (agentType == AgentType.CustomerReviewResponder)
            return 4;

        return 6;
    }

    public static string BuildArtifactContentFallback(string? content, Agent agent, string taskType)
    {
        if (!string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        return
            $"# {agent.DisplayName} Execution Report\n\n" +
            $"The `{taskType}` execution completed without model content.\n\n" +
            "A fallback artifact was created so the task, run, and approval workflow remain traceable. " +
            "Check the CrewAI service logs, integration data availability, and task input before re-running this agent.";
    }

    public static string BuildBriefTitle(Agent agent, JsonElement? inputData)
    {
        if (inputData.HasValue &&
            inputData.Value.ValueKind == JsonValueKind.Object &&
            inputData.Value.TryGetProperty("reviewerName", out var reviewerName))
        {
            return $"Review response for {reviewerName.GetString()}";
        }

        return $"{agent.DisplayName} execution";
    }

    public static ArtifactType MapArtifactType(AgentType agentType, string artifactType)
    {
        var normalized = artifactType.Replace("_", string.Empty, StringComparison.OrdinalIgnoreCase);
        var explicitType = normalized.ToLowerInvariant() switch
        {
            "reviewresponse" => ArtifactType.ReviewResponse,
            "blogpost" => ArtifactType.BlogPost,
            "socialmediagraphic" => ArtifactType.SocialMediaGraphic,
            "instagramcaption" => ArtifactType.InstagramCaption,
            "seoreport" => ArtifactType.SeoReport,
            "adcopy" => ArtifactType.AdCopy,
            "videoedit" => ArtifactType.VideoEdit,
            "uimockup" => ArtifactType.UiMockup,
            "strategydocument" => ArtifactType.StrategyDocument,
            "chatbotflow" => ArtifactType.ChatbotFlow,
            "genericdocument" => ArtifactType.GenericDocument,
            _ => (ArtifactType?)null
        };

        if (explicitType.HasValue)
        {
            return explicitType.Value;
        }

        if (Enum.TryParse<ArtifactType>(artifactType, true, out var parsed))
        {
            return parsed;
        }

        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => ArtifactType.ReviewResponse,
            AgentType.BlogWriter or AgentType.SeoSpecialist => ArtifactType.BlogPost,
            AgentType.SocialMediaDesigner => ArtifactType.SocialMediaGraphic,
            AgentType.InstagramContentGenerator => ArtifactType.InstagramCaption,
            AgentType.UiUxDesigner => ArtifactType.UiMockup,
            AgentType.VideoEditor => ArtifactType.VideoEdit,
            AgentType.GoogleAdsAnalyst => ArtifactType.AdCopy,
            AgentType.AnalyticsAnalyst => ArtifactType.StrategyDocument,
            AgentType.ContentStrategy or AgentType.AiStrategist or AgentType.AiCeo => ArtifactType.StrategyDocument,
            _ => ArtifactType.GenericDocument
        };
    }
}
