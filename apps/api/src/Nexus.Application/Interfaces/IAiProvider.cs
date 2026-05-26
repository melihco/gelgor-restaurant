using Nexus.Domain.Entities;

namespace Nexus.Application.Interfaces;

public interface IAiProvider
{
    Task<DecomposeResult> DecomposeBriefAsync(Brief brief, CancellationToken cancellationToken = default);
    Task<GenerateContentResult> GenerateContentAsync(string prompt, string context, CancellationToken cancellationToken = default);
    Task<AnalyzeContentResult> AnalyzeContentAsync(string content, string analysisType, CancellationToken cancellationToken = default);
}

public class DecomposeResult
{
    public List<TaskDecomposition> Tasks { get; set; } = new();
    public int TotalTokensUsed { get; set; }
}

public class TaskDecomposition
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string AgentType { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public List<int> DependsOnTaskIndices { get; set; } = new();
}

public class GenerateContentResult
{
    public string Content { get; set; } = string.Empty;
    public int TokensUsed { get; set; }
    public string Model { get; set; } = string.Empty;
}

public class AnalyzeContentResult
{
    public Dictionary<string, object> Analysis { get; set; } = new();
    public int TokensUsed { get; set; }
    public string Model { get; set; } = string.Empty;
}
