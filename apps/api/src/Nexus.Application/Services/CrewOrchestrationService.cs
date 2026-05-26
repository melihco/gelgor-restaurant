using System.Text.Json;

namespace Nexus.Application.Services;

public interface ICrewOrchestrationService
{
    Task<CrewExecutionResponse> ExecuteAsync(CrewExecutionRequest request, CancellationToken cancellationToken = default);
}

public class CrewExecutionRequest
{
    public Guid TenantId { get; set; }
    public Guid OfficeId { get; set; }
    public string AgentRole { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public JsonElement? InputData { get; set; }
    public CrewBrandContext BrandContext { get; set; } = new();
    public Guid CorrelationId { get; set; }
}

public class CrewBrandContext
{
    public string BusinessName { get; set; } = string.Empty;
    public string BusinessType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string BrandTone { get; set; } = "professional";
    public string VisualStyle { get; set; } = string.Empty;
    public string TargetAudience { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Languages { get; set; } = "tr";
    public string CampaignGoals { get; set; } = string.Empty;
    public string Competitors { get; set; } = string.Empty;
    public string CustomRules { get; set; } = string.Empty;
    public string Keywords { get; set; } = string.Empty;
    public List<string> AssetDescriptions { get; set; } = new();
}

public class CrewExecutionResponse
{
    public string Status { get; set; } = string.Empty;
    public string AgentRole { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string ArtifactType { get; set; } = string.Empty;
    public string ArtifactTitle { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public Dictionary<string, object?> Metadata { get; set; } = new();
    public Guid? CorrelationId { get; set; }
    /// <summary>
    /// Structured action payload extracted by the Python backend from the LLM output.
    /// Contains action_type, provider, approval_required, payload, human_readable.
    /// Null if the agent role does not produce executable actions.
    /// </summary>
    public JsonElement? ActionPayload { get; set; }

    /// <summary>Total LLM tokens reported by CrewAI for this run (0 if unknown).</summary>
    public int TokensUsed { get; set; }
}
