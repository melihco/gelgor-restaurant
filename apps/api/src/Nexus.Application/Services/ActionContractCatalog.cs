using System.Text.Json;
using Nexus.Domain.Enums;

namespace Nexus.Application.Services;

/// <summary>Result of validating a SuggestedAction payload against its contract.</summary>
public sealed record ActionValidationResult(bool Success, string Message);

/// <summary>Public-facing description of a supported action type (support-matrix row).</summary>
public sealed record ActionSupportInfo(
    string ActionType,
    string Label,
    string Provider,
    bool LiveSupported,
    IReadOnlyList<string> RequiredPayloadFields);

/// <summary>
/// Single source of truth for the action-type contracts: which provider an action
/// targets, whether it supports live execution, and which payload fields it requires.
/// Extracted out of ActionsController so contract metadata and payload validation
/// live in one cohesive place (SRP) instead of being inlined in the controller.
/// </summary>
public interface IActionContractCatalog
{
    IReadOnlyList<ActionSupportInfo> GetSupportMatrix();
    bool IsLiveSupported(string actionType);
    ActionValidationResult ValidatePayload(string actionType, IntegrationProvider provider, string payloadJson);
}

public sealed class ActionContractCatalog : IActionContractCatalog
{
    private sealed record ActionContract(
        string Label,
        IntegrationProvider? Provider,
        bool ApprovalRequired,
        bool LiveSupported,
        string[] RequiredPayloadKeys);

    private static readonly IReadOnlyDictionary<string, ActionContract> Contracts =
        new Dictionary<string, ActionContract>(StringComparer.OrdinalIgnoreCase)
        {
            ["reply_to_google_review"] = new("Google yorum yanıtı", IntegrationProvider.GoogleBusiness, true, true, new[] { "reply_text" }),
            ["log_review_analysis"] = new("Yorum analizi kaydı", null, false, true, new[] { "raw_analysis" }),
            ["create_weekly_content_strategy"] = new("Haftalık içerik stratejisi", IntegrationProvider.Instagram, true, false, new[] { "mission_brief" }),
            ["create_instagram_content_plan"] = new("Instagram içerik planı", IntegrationProvider.Instagram, true, true, new[] { "ideas" }),
            ["schedule_instagram_posts"] = new("Instagram paylaşım takvimi", IntegrationProvider.Instagram, true, true, new[] { "posts" }),
            ["apply_campaign_recommendations"] = new("Google Ads optimizasyon önerileri", IntegrationProvider.GoogleAds, true, true, new[] { "recommendations" }),
            ["create_ad_creatives"] = new("Google Ads kreatifleri", IntegrationProvider.GoogleAds, true, true, new[] { "creatives" }),
            ["apply_budget_optimization"] = new("Google Ads bütçe optimizasyonu", IntegrationProvider.GoogleAds, true, true, new[] { "campaign_changes" }),
            ["log_analytics_report"] = new("Analitik rapor kaydı", IntegrationProvider.GoogleAnalytics, false, true, new[] { "summary" }),
            ["generic_output"] = new("Genel AI çıktısı", null, false, false, new[] { "raw_output" }),
        };

    public IReadOnlyList<ActionSupportInfo> GetSupportMatrix() =>
        Contracts.Select(contract => new ActionSupportInfo(
            contract.Key,
            contract.Value.Label,
            contract.Value.Provider?.ToString() ?? "Internal",
            contract.Value.LiveSupported,
            contract.Value.RequiredPayloadKeys)).ToList();

    public bool IsLiveSupported(string actionType) =>
        Contracts.TryGetValue(actionType, out var contract) && contract.LiveSupported;

    public ActionValidationResult ValidatePayload(
        string actionType,
        IntegrationProvider provider,
        string payloadJson)
    {
        if (!Contracts.TryGetValue(actionType, out var contract))
            return new ActionValidationResult(false, $"Bilinmeyen action type: {actionType}");

        if (contract.Provider.HasValue && contract.Provider.Value != provider)
            return new ActionValidationResult(
                false,
                $"Action provider uyumsuz: {actionType} için {contract.Provider.Value} bekleniyor, {provider} geldi.");

        JsonElement payload;
        try
        {
            payload = JsonSerializer.Deserialize<JsonElement>(payloadJson);
        }
        catch
        {
            return new ActionValidationResult(false, "Payload geçerli JSON değil.");
        }

        if (payload.ValueKind != JsonValueKind.Object)
            return new ActionValidationResult(false, "Payload JSON object formatında olmalı.");

        var missingKeys = contract.RequiredPayloadKeys
            .Where(key => !HasMeaningfulProperty(payload, key))
            .ToArray();

        if (missingKeys.Length > 0)
            return new ActionValidationResult(
                false,
                $"Payload eksik alan içeriyor: {string.Join(", ", missingKeys)}");

        return new ActionValidationResult(true, $"{contract.Label} payload doğrulandı.");
    }

    private static bool HasMeaningfulProperty(JsonElement payload, string key)
    {
        if (!payload.TryGetProperty(key, out var value))
            return false;

        return value.ValueKind switch
        {
            JsonValueKind.String => !string.IsNullOrWhiteSpace(value.GetString()),
            JsonValueKind.Array => value.GetArrayLength() > 0,
            JsonValueKind.Object => value.EnumerateObject().Any(),
            JsonValueKind.Null or JsonValueKind.Undefined => false,
            _ => true
        };
    }
}
