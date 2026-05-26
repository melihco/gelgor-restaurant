using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Nexus.Application.Services;

namespace Nexus.Infrastructure.Services;

public class OpenAiImageGenerationService : IImageGenerationService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OpenAiImageGenerationService> _logger;
    private static readonly ConcurrentDictionary<string, string> PromptCache = new();

    public OpenAiImageGenerationService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<OpenAiImageGenerationService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string?> GenerateImageDataUrlAsync(string prompt, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(prompt))
            return null;

        var normalizedPrompt = prompt.Trim();
        if (PromptCache.TryGetValue(normalizedPrompt, out var cached))
            return cached;

        var apiKey =
            _configuration["OpenAI:ApiKey"] ??
            Environment.GetEnvironmentVariable("OPENAI_API_KEY");

        if (string.IsNullOrWhiteSpace(apiKey))
            return null;

        try
        {
            var payload = new
            {
                model = "gpt-image-1",
                prompt = normalizedPrompt,
                size = "1024x1024"
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/images/generations")
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
                    "OpenAI image generation failed with status {StatusCode}: {Body}",
                    response.StatusCode,
                    body);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var dataElement) ||
                dataElement.ValueKind != JsonValueKind.Array ||
                dataElement.GetArrayLength() == 0)
            {
                return null;
            }

            var first = dataElement[0];
            if (!first.TryGetProperty("b64_json", out var b64Element))
                return null;

            var base64 = b64Element.GetString();
            if (string.IsNullOrWhiteSpace(base64))
                return null;

            var dataUrl = $"data:image/png;base64,{base64}";
            PromptCache[normalizedPrompt] = dataUrl;
            return dataUrl;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenAI image generation exception");
            return null;
        }
    }
}

