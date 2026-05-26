using Microsoft.Extensions.Logging;
using Nexus.Application.Services;

namespace Nexus.Infrastructure.Services;

/// <summary>
/// Development-only stub when Python Crew servisi (:8000) çalışmıyorken mission/agent akışının kırılmaması için.
/// Üretimde kullanılmaz; gerçek çıktı için <c>OrchestrationService:UseDevMock=false</c> ve backend'i başlatın.
/// </summary>
public sealed class DevMockCrewOrchestrationService : ICrewOrchestrationService
{
    private readonly ILogger<DevMockCrewOrchestrationService> _logger;

    public DevMockCrewOrchestrationService(ILogger<DevMockCrewOrchestrationService> logger)
    {
        _logger = logger;
    }

    public Task<CrewExecutionResponse> ExecuteAsync(CrewExecutionRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogWarning(
            "DevMockCrewOrchestrationService: stub response (OrchestrationService:UseDevMock=true). " +
            "Gerçek CrewAI için Python servisini http://localhost:8000 üzerinde çalıştırıp UseDevMock=false yapın.");

        var brand = string.IsNullOrWhiteSpace(request.BrandContext.BusinessName)
            ? "Tenant"
            : request.BrandContext.BusinessName;
        var tone = request.BrandContext.BrandTone;
        var inputPreview = request.InputData?.GetRawText();
        if (!string.IsNullOrEmpty(inputPreview) && inputPreview.Length > 400)
            inputPreview = inputPreview[..400] + "…";

        var title = $"{request.TaskType} · {brand} (dev mock)";
        var content =
            $"# {title}\n\n" +
            $"> Bu çıktı **geliştirme mock** orkestrasyonudur; Python Crew servisi kapalıyken üretilir.\n\n" +
            $"**İşletme:** {brand}  \n" +
            $"**Ton:** {tone}  \n" +
            $"**Rol:** `{request.AgentRole}`  \n" +
            $"**Görev tipi:** `{request.TaskType}`  \n\n" +
            "## Örnek içerik\n\n" +
            "- Mock madde 1: Markanıza uygun örnek başlık veya yanıt taslağı.\n" +
            "- Mock madde 2: Gerçek çalıştırma için `backend` klasöründe `uvicorn app.main:app --port 8000` ve `UseDevMock=false`.\n\n" +
            "### İstek girdisi (özet)\n\n" +
            (string.IsNullOrWhiteSpace(inputPreview) ? "_Girdi yok._" : "```json\n" + inputPreview + "\n```");

        var metadata = new Dictionary<string, object?>
        {
            ["source"] = "dev_mock_crew_orchestration",
            ["correlationId"] = request.CorrelationId.ToString("n"),
        };

        var response = new CrewExecutionResponse
        {
            Status = "completed",
            AgentRole = request.AgentRole,
            TaskType = request.TaskType,
            ArtifactType = "GenericDocument",
            ArtifactTitle = title,
            Content = content,
            Summary = "Dev mock — Crew servisi çağrılmadı.",
            Metadata = metadata,
            CorrelationId = request.CorrelationId,
            ActionPayload = null,
            TokensUsed = 0,
        };

        return Task.FromResult(response);
    }
}
