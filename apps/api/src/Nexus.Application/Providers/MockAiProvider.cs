using Nexus.Application.Interfaces;
using Nexus.Domain.Entities;

namespace Nexus.Application.Providers;

public class MockAiProvider : IAiProvider
{
    public Task<DecomposeResult> DecomposeBriefAsync(Brief brief, CancellationToken cancellationToken = default)
    {
        var tasks = new List<TaskDecomposition>
        {
            new()
            {
                Title = "Research and Planning",
                Description = "Conduct research and create initial planning document",
                AgentType = "AiStrategist",
                EstimatedMinutes = 120,
                DependsOnTaskIndices = new()
            },
            new()
            {
                Title = "Content Creation",
                Description = "Create main content based on brief requirements",
                AgentType = "BlogWriter",
                EstimatedMinutes = 180,
                DependsOnTaskIndices = new() { 0 }
            },
            new()
            {
                Title = "Design Assets",
                Description = "Design visual assets for the content",
                AgentType = "UiUxDesigner",
                EstimatedMinutes = 240,
                DependsOnTaskIndices = new() { 0 }
            },
            new()
            {
                Title = "Social Media Copy",
                Description = "Create social media captions and graphics",
                AgentType = "SocialMediaDesigner",
                EstimatedMinutes = 90,
                DependsOnTaskIndices = new() { 1, 2 }
            },
            new()
            {
                Title = "SEO Optimization",
                Description = "Optimize content for search engines",
                AgentType = "SeoSpecialist",
                EstimatedMinutes = 60,
                DependsOnTaskIndices = new() { 1 }
            }
        };

        var result = new DecomposeResult
        {
            Tasks = tasks,
            TotalTokensUsed = 2500
        };

        return Task.FromResult(result);
    }

    public Task<GenerateContentResult> GenerateContentAsync(string prompt, string context, CancellationToken cancellationToken = default)
    {
        var mockContent = $"""
            Generated content for: {prompt}

            Context: {context}

            This is a comprehensive response that addresses all aspects of the request.
            The content follows best practices and industry standards.

            Key points:
            - Point 1: Detailed explanation
            - Point 2: Comprehensive coverage
            - Point 3: Professional quality

            The content is ready for review and implementation.
            """;

        var result = new GenerateContentResult
        {
            Content = mockContent,
            TokensUsed = 1200,
            Model = "gpt-4-mock"
        };

        return Task.FromResult(result);
    }

    public Task<AnalyzeContentResult> AnalyzeContentAsync(string content, string analysisType, CancellationToken cancellationToken = default)
    {
        var analysis = new Dictionary<string, object>
        {
            { "sentiment", "positive" },
            { "readability_score", 85 },
            { "keyword_density", 2.5 },
            { "estimated_reading_time_minutes", 5 },
            { "seo_score", 78 },
            { "recommendations", new[] { "Add more examples", "Improve structure", "Enhance visuals" } }
        };

        var result = new AnalyzeContentResult
        {
            Analysis = analysis,
            TokensUsed = 800,
            Model = "gpt-4-mock"
        };

        return Task.FromResult(result);
    }
}
