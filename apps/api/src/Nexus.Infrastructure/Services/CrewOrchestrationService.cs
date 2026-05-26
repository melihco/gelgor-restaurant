using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Nexus.Application.Services;

namespace Nexus.Infrastructure.Services;

public class CrewOrchestrationService : ICrewOrchestrationService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        // metadata / action_payload iç içe nesneler — object? hedefinde JsonElement kullan
        UnknownTypeHandling = JsonUnknownTypeHandling.JsonElement,
    };

    private readonly HttpClient _httpClient;
    private readonly ILogger<CrewOrchestrationService> _logger;

    public CrewOrchestrationService(HttpClient httpClient, ILogger<CrewOrchestrationService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<CrewExecutionResponse> ExecuteAsync(CrewExecutionRequest request, CancellationToken cancellationToken = default)
    {
        // HttpClient.Timeout ile aynı hizada kesin iptal (bazı ortamlarda yalnızca Timeout yetmeyebilir).
        var httpTimeoutMs = (int)Math.Clamp(_httpClient.Timeout.TotalMilliseconds, 30_000d, 3_600_000d);
        using var deadlineCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(httpTimeoutMs + 20_000));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, deadlineCts.Token);
        var linked = linkedCts.Token;

        await EnsureCrewServiceReachableAsync(linked).ConfigureAwait(false);

        var attempts = 0;
        while (true)
        {
            attempts++;

            try
            {
                var executeUri = new Uri(_httpClient.BaseAddress!, "/internal/v1/orchestration/execute");
                _logger.LogInformation(
                    "Python Crew çağrısı başlıyor: POST {ExecuteUri} correlationId={CorrelationId} agentRole={AgentRole} taskType={TaskType} attempt={Attempt}",
                    executeUri,
                    request.CorrelationId,
                    request.AgentRole,
                    request.TaskType,
                    attempts);

                using var response = await _httpClient.PostAsJsonAsync(
                    "/internal/v1/orchestration/execute",
                    request,
                    SerializerOptions,
                    linked).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    var errorBody = await response.Content.ReadAsStringAsync(linked).ConfigureAwait(false);

                    if ((int)response.StatusCode >= 500 && attempts < 2)
                    {
                        _logger.LogWarning(
                            "Crew orchestration returned {StatusCode}. Retrying once for correlation {CorrelationId}.",
                            response.StatusCode,
                            request.CorrelationId);
                        continue;
                    }

                    _logger.LogError(
                        "Crew orchestration call failed with status {StatusCode}: {ErrorBody}",
                        response.StatusCode,
                        errorBody);
                    var errorDetail = string.IsNullOrWhiteSpace(errorBody)
                        ? response.ReasonPhrase
                        : errorBody;
                    if (errorDetail?.Length > 800)
                    {
                        errorDetail = errorDetail[..800];
                    }

                    throw new InvalidOperationException(
                        $"Crew orchestration failed: {(int)response.StatusCode} {response.StatusCode}. {errorDetail}");
                }

                var bodyJson = await response.Content.ReadAsStringAsync(linked).ConfigureAwait(false);

                CrewExecutionResponse? payload;
                try
                {
                    payload = JsonSerializer.Deserialize<CrewExecutionResponse>(bodyJson, SerializerOptions);
                }
                catch (JsonException jx)
                {
                    _logger.LogError(
                        jx,
                        "Crew orchestration JSON parse failed for correlation {CorrelationId}. Body prefix: {BodyPrefix}",
                        request.CorrelationId,
                        bodyJson.Length > 400 ? bodyJson[..400] : bodyJson);
                    throw;
                }

                return payload ?? throw new InvalidOperationException("Crew orchestration returned an empty response.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested || deadlineCts.IsCancellationRequested)
            {
                _logger.LogWarning(
                    "Crew orchestration cancelled for correlation {CorrelationId}. callerCancelled={CallerCancelled} deadlineCancelled={DeadlineCancelled} attempt={Attempt}",
                    request.CorrelationId,
                    cancellationToken.IsCancellationRequested,
                    deadlineCts.IsCancellationRequested,
                    attempts);
                throw;
            }
            catch (HttpRequestException) when (attempts < 2)
            {
                _logger.LogWarning(
                    "Crew orchestration network failure for correlation {CorrelationId}. Retrying once.",
                    request.CorrelationId);
            }
        }
    }

    /// <summary>
    /// Python Crew servisinin ayakta olduğunu doğrular; kapalı veya yanlış BaseUrl için anlamlı hata (Gram Master / content_ideation dahil).
    /// </summary>
    private async Task EnsureCrewServiceReachableAsync(CancellationToken cancellationToken)
    {
        using var probe = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        probe.CancelAfter(TimeSpan.FromSeconds(6));

        try
        {
            // Tam gövdeyi oku; ResponseHeadersRead + boşaltılmamış gövde havuzlanan bağlantıda
            // sonraki POST yanıtının bozulmasına veya JSON okumanın takılmasına yol açabilir.
            using var response = await _httpClient.GetAsync("/health", probe.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(
                    $"Crew servisi /health {(int)response.StatusCode} döndü. Python (varsayılan port 8000) ve appsettings.json içindeki OrchestrationService:BaseUrl değerini kontrol edin.");
            }
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                "Crew servisi 6 sn içinde /health yanıtı vermedi. Python FastAPI sürecini başlatın; OrchestrationService:BaseUrl doğru host/port mu kontrol edin.",
                ex);
        }
        catch (HttpRequestException ex)
        {
            throw new InvalidOperationException(
                "Crew servisine bağlanılamıyor (Python kapalı veya yanlış adres). Backend’i çalıştırın ve Nexus.Api’de OrchestrationService:BaseUrl ile UseDevMock=false ayarını doğrulayın.",
                ex);
        }
    }
}
