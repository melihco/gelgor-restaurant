using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Nexus.Application.Services;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Services;

public class QdrantVectorMemoryService : IVectorMemoryService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<QdrantVectorMemoryService> _logger;
    private readonly SemaphoreSlim _collectionLock = new(1, 1);
    private bool _collectionReady;

    public QdrantVectorMemoryService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<QdrantVectorMemoryService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<bool> UpsertBrandMemoryAsync(
        BrandMemoryDocument memory,
        CancellationToken cancellationToken = default)
    {
        if (!IsEnabled() || string.IsNullOrWhiteSpace(memory.Content))
            return false;

        try
        {
            await EnsureCollectionAsync(cancellationToken);
            var vector = await CreateEmbeddingAsync(BuildEmbeddingInput(memory), cancellationToken);
            if (vector.Count == 0)
                return false;

            var payload = new
            {
                points = new[]
                {
                    new
                    {
                        id = memory.Id,
                        vector,
                        payload = new
                        {
                            tenantId = memory.TenantId.ToString(),
                            memoryId = memory.Id.ToString(),
                            documentType = memory.DocumentType,
                            title = memory.Title,
                            content = TrimTo(memory.Content, 1800),
                            createdAt = memory.CreatedAt
                        }
                    }
                }
            };

            using var response = await SendQdrantAsync(
                HttpMethod.Put,
                $"/collections/{CollectionName}/points?wait=true",
                payload,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Qdrant upsert failed with status {StatusCode}: {Body}",
                    response.StatusCode,
                    TrimTo(body, 700));
                return false;
            }

            memory.EmbeddingId = memory.Id;
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Vector memory upsert failed for memory {MemoryId}", memory.Id);
            return false;
        }
    }

    public async Task<IReadOnlyList<VectorMemorySearchResult>> SearchBrandMemoryAsync(
        Guid tenantId,
        string query,
        int limit = 4,
        CancellationToken cancellationToken = default)
    {
        if (!IsEnabled() || string.IsNullOrWhiteSpace(query))
            return Array.Empty<VectorMemorySearchResult>();

        try
        {
            await EnsureCollectionAsync(cancellationToken);
            var vector = await CreateEmbeddingAsync(query, cancellationToken);
            if (vector.Count == 0)
                return Array.Empty<VectorMemorySearchResult>();

            var payload = new
            {
                vector,
                limit,
                with_payload = true,
                filter = new
                {
                    must = new[]
                    {
                        new
                        {
                            key = "tenantId",
                            match = new { value = tenantId.ToString() }
                        }
                    }
                }
            };

            using var response = await SendQdrantAsync(
                HttpMethod.Post,
                $"/collections/{CollectionName}/points/search",
                payload,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Qdrant search failed with status {StatusCode}: {Body}",
                    response.StatusCode,
                    TrimTo(body, 700));
                return Array.Empty<VectorMemorySearchResult>();
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("result", out var resultElement) ||
                resultElement.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<VectorMemorySearchResult>();
            }

            var results = new List<VectorMemorySearchResult>();
            foreach (var item in resultElement.EnumerateArray())
            {
                var score = item.TryGetProperty("score", out var scoreElement)
                    ? scoreElement.GetDouble()
                    : 0d;

                if (!item.TryGetProperty("payload", out var itemPayload) ||
                    itemPayload.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var memoryId = TryGetString(itemPayload, "memoryId");
                if (!Guid.TryParse(memoryId, out var parsedMemoryId))
                    continue;

                results.Add(new VectorMemorySearchResult(
                    parsedMemoryId,
                    TryGetString(itemPayload, "documentType"),
                    TryGetString(itemPayload, "title"),
                    TryGetString(itemPayload, "content"),
                    score));
            }

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Vector memory search failed for tenant {TenantId}", tenantId);
            return Array.Empty<VectorMemorySearchResult>();
        }
    }

    public async Task<VectorMemoryStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var enabled = IsEnabled();
        var embeddingConfigured = HasEmbeddingProvider();
        var qdrantReachable = false;

        if (enabled)
        {
            try
            {
                using var response = await _httpClient.GetAsync($"{QdrantBaseUrl}/health", cancellationToken);
                qdrantReachable = response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Qdrant health check failed.");
            }
        }

        var message = enabled switch
        {
            false => "Vector memory is disabled; relational fallback is active.",
            true when !qdrantReachable => "Qdrant is enabled but not reachable; relational fallback is active.",
            true when !embeddingConfigured => "Qdrant is reachable but OpenAI embedding provider is not configured.",
            _ => "Vector memory is ready."
        };

        return new VectorMemoryStatus(
            enabled,
            qdrantReachable,
            embeddingConfigured,
            CollectionName,
            message);
    }

    private bool IsEnabled()
        => bool.TryParse(_configuration["Qdrant:Enabled"], out var enabled) && enabled;

    private bool HasEmbeddingProvider()
        => !string.IsNullOrWhiteSpace(_configuration["OpenAI:ApiKey"]) ||
           !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));

    private string CollectionName =>
        _configuration["Qdrant:Collection"] ?? "brand_memory";

    private int VectorSize =>
        int.TryParse(_configuration["Qdrant:VectorSize"], out var size) ? size : 1536;

    private string QdrantBaseUrl =>
        (_configuration["Qdrant:BaseUrl"] ?? "http://localhost:6333").TrimEnd('/');

    private string EmbeddingModel =>
        _configuration["OpenAI:EmbeddingModel"] ?? "text-embedding-3-small";

    private async Task EnsureCollectionAsync(CancellationToken cancellationToken)
    {
        if (_collectionReady)
            return;

        await _collectionLock.WaitAsync(cancellationToken);
        try
        {
            if (_collectionReady)
                return;

            var payload = new
            {
                vectors = new
                {
                    size = VectorSize,
                    distance = "Cosine"
                }
            };

            using var response = await SendQdrantAsync(
                HttpMethod.Put,
                $"/collections/{CollectionName}",
                payload,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Qdrant collection ensure failed with status {StatusCode}: {Body}",
                    response.StatusCode,
                    TrimTo(body, 700));
            }

            _collectionReady = response.IsSuccessStatusCode;
        }
        finally
        {
            _collectionLock.Release();
        }
    }

    private async Task<HttpResponseMessage> SendQdrantAsync(
        HttpMethod method,
        string path,
        object body,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, $"{QdrantBaseUrl}{path}")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(body),
                Encoding.UTF8,
                "application/json")
        };

        var apiKey = _configuration["Qdrant:ApiKey"];
        if (!string.IsNullOrWhiteSpace(apiKey))
            request.Headers.Add("api-key", apiKey);

        return await _httpClient.SendAsync(request, cancellationToken);
    }

    private async Task<IReadOnlyList<float>> CreateEmbeddingAsync(
        string input,
        CancellationToken cancellationToken)
    {
        var apiKey =
            _configuration["OpenAI:ApiKey"] ??
            Environment.GetEnvironmentVariable("OPENAI_API_KEY");

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogDebug("OpenAI API key is not configured; vector memory is running in fallback mode.");
            return Array.Empty<float>();
        }

        var payload = new
        {
            model = EmbeddingModel,
            input = TrimTo(input, 6000)
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/embeddings")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "OpenAI embedding request failed with status {StatusCode}: {Body}",
                response.StatusCode,
                TrimTo(body, 700));
            return Array.Empty<float>();
        }

        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(json);
        var embeddingElement = document.RootElement
            .GetProperty("data")[0]
            .GetProperty("embedding");

        return embeddingElement
            .EnumerateArray()
            .Select(value => value.GetSingle())
            .ToArray();
    }

    private static string BuildEmbeddingInput(BrandMemoryDocument memory)
        => $"Type: {memory.DocumentType}\nTitle: {memory.Title}\nContent:\n{memory.Content}";

    private static string TryGetString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : string.Empty;

    private static string TrimTo(string value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return value.Length <= max ? value : value.Substring(0, max);
    }
}
