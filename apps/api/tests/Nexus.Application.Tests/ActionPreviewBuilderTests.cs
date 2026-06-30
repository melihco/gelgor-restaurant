using System.Text.Json;
using Nexus.Application.Services;

namespace Nexus.Application.Tests;

public class ActionPreviewBuilderTests
{
    private sealed class NullImageService : IImageGenerationService
    {
        public Task<string?> GenerateImageDataUrlAsync(string prompt, CancellationToken cancellationToken = default)
            => Task.FromResult<string?>(null);
    }

    private readonly ActionPreviewBuilder _builder = new(new NullImageService());

    private static JsonElement AsJson(object value) => JsonSerializer.SerializeToElement(value);

    [Fact]
    public async Task ReplyToGoogleReview_RendersTextPreview()
    {
        var result = await _builder.BuildRenderedPreviewAsync(
            "reply_to_google_review",
            "{\"reply_text\":\"Teşekkürler\"}",
            "fallback");

        var json = AsJson(result);
        Assert.Equal("text", json.GetProperty("kind").GetString());
        Assert.Equal("Teşekkürler", json.GetProperty("caption").GetString());
    }

    [Fact]
    public async Task InvalidJson_FallsBackToTextPreview()
    {
        var result = await _builder.BuildRenderedPreviewAsync("anything", "not-json", "Başlık");

        var json = AsJson(result);
        Assert.Equal("text", json.GetProperty("kind").GetString());
        Assert.Equal("Başlık", json.GetProperty("title").GetString());
        Assert.Equal("not-json", json.GetProperty("caption").GetString());
    }

    [Fact]
    public async Task UnknownActionType_RendersGenericReport()
    {
        var result = await _builder.BuildRenderedPreviewAsync(
            "some_new_action",
            "{\"summary\":\"özet metni\"}",
            "fallback");

        var json = AsJson(result);
        Assert.Equal("report", json.GetProperty("kind").GetString());
        Assert.Equal("özet metni", json.GetProperty("summary").GetString());
    }

    [Fact]
    public async Task WeeklyContentStrategy_RendersStrategyPreview()
    {
        // Include the optional blocks so the preview's JsonElement fields are
        // populated (a default/Undefined JsonElement is not serializable).
        var result = await _builder.BuildRenderedPreviewAsync(
            "create_weekly_content_strategy",
            "{\"weekly_theme\":\"Yaz Kampanyası\",\"mission_brief\":\"brief\"," +
            "\"pillar_mix\":{},\"recommended_formats\":[],\"template_use_cases\":[],\"asset_intents\":[]}",
            "fallback");

        var json = AsJson(result);
        Assert.Equal("strategy", json.GetProperty("kind").GetString());
        Assert.Equal("Yaz Kampanyası", json.GetProperty("title").GetString());
    }
}
