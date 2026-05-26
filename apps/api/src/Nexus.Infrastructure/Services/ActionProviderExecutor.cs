using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Infrastructure.Services;

public class ActionProviderExecutor : IActionProviderExecutor
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ActionProviderExecutor> _logger;

    public ActionProviderExecutor(HttpClient httpClient, ILogger<ActionProviderExecutor> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<ActionProviderExecutionResult> ExecuteAsync(
        SuggestedAction action,
        string mode,
        CancellationToken cancellationToken = default)
    {
        var normalizedMode = string.IsNullOrWhiteSpace(mode)
            ? "dry-run"
            : mode.Trim().ToLowerInvariant();

        if (normalizedMode is not ("dry-run" or "live"))
        {
            return Fail(
                normalizedMode,
                $"Unsupported action execution mode '{mode}'. Use 'dry-run' or 'live'.",
                new { error = "unsupported_execution_mode" });
        }

        return normalizedMode == "live"
            ? await ExecuteLiveAsync(action, cancellationToken)
            : ExecuteDryRun(action);
    }

    private async Task<ActionProviderExecutionResult> ExecuteLiveAsync(
        SuggestedAction action,
        CancellationToken cancellationToken)
    {
        if (action.ActionType == "log_analytics_report" || action.ActionType == "log_review_analysis")
        {
            return Ok(
                "live",
                $"Internal action '{action.ActionType}' was recorded.",
                new { status = "logged", provider = action.Provider.ToString() },
                new { logged = true, timestamp = DateTime.UtcNow });
        }

        if (action.IntegrationConnection == null)
        {
            return Fail(
                "live",
                "Live execution requires a tenant-owned integration connection.",
                new { error = "integration_connection_required" });
        }

        if (action.IntegrationConnection.Status != IntegrationStatus.Connected)
        {
            return Fail(
                "live",
                $"Integration connection is not connected: {action.IntegrationConnection.Status}.",
                new { error = "integration_not_connected", status = action.IntegrationConnection.Status.ToString() });
        }

        if (action.ActionType == "apply_budget_optimization" && action.Provider == IntegrationProvider.GoogleAds)
        {
            return await ExecuteGoogleAdsBudgetOptimizationAsync(action, cancellationToken);
        }

        if (action.ActionType == "create_ad_creatives" && action.Provider == IntegrationProvider.GoogleAds)
        {
            return await ExecuteGoogleAdsCreativesAsync(action, cancellationToken);
        }

        if (action.ActionType == "reply_to_google_review" && action.Provider == IntegrationProvider.GoogleBusiness)
        {
            return await ExecuteGoogleBusinessReviewReplyAsync(action, cancellationToken);
        }

        if (action.ActionType is "create_instagram_content_plan" or "schedule_instagram_posts" &&
            action.Provider == IntegrationProvider.Instagram)
        {
            return await ExecuteInstagramScheduleAsync(action, cancellationToken);
        }

        return Fail(
            "live",
            $"Live provider adapter is not implemented for '{action.ActionType}'.",
            new { error = "live_adapter_not_implemented", action.ActionType, provider = action.Provider.ToString() });
    }

    private async Task<ActionProviderExecutionResult> ExecuteGoogleAdsBudgetOptimizationAsync(
        SuggestedAction action,
        CancellationToken cancellationToken)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(action.Payload);
            if (!payload.TryGetProperty("campaign_changes", out var changes) ||
                changes.ValueKind != JsonValueKind.Array ||
                changes.GetArrayLength() == 0)
            {
                return Fail(
                    "live",
                    "Google Ads budget optimization requires campaign_changes.",
                    new { error = "missing_campaign_changes" });
            }

            var request = new
            {
                campaign_changes = changes,
                account_id = action.IntegrationConnection?.AccountId ?? string.Empty
            };

            using var response = await _httpClient.PostAsJsonAsync(
                "/api/v1/ads/campaigns/budget/bulk",
                request,
                cancellationToken);

            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Google Ads budget live execution failed with status {StatusCode}: {Body}",
                    response.StatusCode,
                    TrimTo(responseBody, 700));
                return Fail(
                    "live",
                    $"Google Ads provider returned {(int)response.StatusCode} {response.StatusCode}.",
                    new { error = "provider_http_error", status = (int)response.StatusCode, body = TrimTo(responseBody, 700) });
            }

            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement.Clone();
            var success = root.TryGetProperty("success", out var successElement) &&
                          successElement.ValueKind is JsonValueKind.True;

            var applied = root.TryGetProperty("applied", out var appliedElement) && appliedElement.TryGetInt32(out var appliedValue)
                ? appliedValue
                : 0;
            var failed = root.TryGetProperty("failed", out var failedElement) && failedElement.TryGetInt32(out var failedValue)
                ? failedValue
                : 0;

            return new ActionProviderExecutionResult(
                success,
                success
                    ? $"Google Ads budget optimization applied to {applied} campaign(s)."
                    : $"Google Ads budget optimization completed with {failed} failure(s).",
                root,
                new { applied, failed, timestamp = DateTime.UtcNow },
                "live");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Ads budget live execution exception.");
            return Fail(
                "live",
                "Google Ads budget live execution failed.",
                new { error = "provider_exception", detail = ex.Message });
        }
    }

    private async Task<ActionProviderExecutionResult> ExecuteGoogleBusinessReviewReplyAsync(
        SuggestedAction action,
        CancellationToken cancellationToken)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(action.Payload);
            var reviewContext = GetObject(payload, "review_context");
            var reviewId = FirstNonEmpty(
                GetString(payload, "review_id"),
                GetString(reviewContext, "review_id"),
                action.TargetRef);
            var replyText = GetString(payload, "reply_text");

            if (string.IsNullOrWhiteSpace(reviewId) || string.IsNullOrWhiteSpace(replyText))
            {
                return Fail(
                    "live",
                    "Google Business review reply requires review_id and reply_text.",
                    new { error = "missing_review_reply_fields" });
            }

            var request = new
            {
                account_id = action.IntegrationConnection?.AccountId ?? string.Empty,
                review_id = reviewId,
                reply_text = replyText,
                access_token = action.IntegrationConnection?.EncryptedAccessToken ?? string.Empty
            };

            return await PostProviderActionAsync(
                "/api/v1/provider-actions/google-business/reviews/reply",
                request,
                "Google Business review reply submitted.",
                "Google Business review reply failed.",
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Business review reply live execution exception.");
            return Fail("live", "Google Business review reply live execution failed.", new { error = "provider_exception", detail = ex.Message });
        }
    }

    private async Task<ActionProviderExecutionResult> ExecuteInstagramScheduleAsync(
        SuggestedAction action,
        CancellationToken cancellationToken)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(action.Payload);
            var posts = GetArray(payload, "posts");
            if (posts.GetArrayLength() == 0)
                posts = GetArray(payload, "ideas");

            if (posts.GetArrayLength() == 0)
            {
                return Fail(
                    "live",
                    "Instagram scheduling requires posts or ideas.",
                    new { error = "missing_instagram_posts" });
            }

            var request = new
            {
                account_id = action.IntegrationConnection?.AccountId ?? string.Empty,
                posts,
                access_token = action.IntegrationConnection?.EncryptedAccessToken ?? string.Empty
            };

            return await PostProviderActionAsync(
                "/api/v1/provider-actions/instagram/posts/schedule",
                request,
                "Instagram content schedule submitted.",
                "Instagram content schedule failed.",
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instagram schedule live execution exception.");
            return Fail("live", "Instagram schedule live execution failed.", new { error = "provider_exception", detail = ex.Message });
        }
    }

    private async Task<ActionProviderExecutionResult> ExecuteGoogleAdsCreativesAsync(
        SuggestedAction action,
        CancellationToken cancellationToken)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(action.Payload);
            var creatives = GetArray(payload, "creatives");
            if (creatives.GetArrayLength() == 0)
                creatives = GetArray(payload, "ads");

            var adGroupId = FirstNonEmpty(
                GetString(payload, "ad_group_id"),
                GetConnectionConfigString(action, "ad_group_id"));
            var finalUrl = FirstNonEmpty(
                GetString(payload, "final_url"),
                GetConnectionConfigString(action, "final_url"));

            if (creatives.GetArrayLength() == 0 || string.IsNullOrWhiteSpace(adGroupId) || string.IsNullOrWhiteSpace(finalUrl))
            {
                return Fail(
                    "live",
                    "Google Ads creative upload requires creatives plus ad_group_id and final_url in payload or integration configuration.",
                    new { error = "missing_google_ads_creative_fields" });
            }

            var headlines = new List<string>();
            var descriptions = new List<string>();
            foreach (var creative in creatives.EnumerateArray())
            {
                var headline = FirstNonEmpty(
                    GetString(creative, "headline"),
                    GetString(creative, "title"),
                    GetString(creative, "concept_title"));
                var description = FirstNonEmpty(
                    GetString(creative, "description"),
                    GetString(creative, "body"),
                    GetString(creative, "caption"),
                    GetString(creative, "caption_draft"));

                if (!string.IsNullOrWhiteSpace(headline))
                    headlines.Add(TrimTo(headline, 30));
                if (!string.IsNullOrWhiteSpace(description))
                    descriptions.Add(TrimTo(description, 90));
            }

            if (headlines.Count == 0 || descriptions.Count == 0)
            {
                return Fail(
                    "live",
                    "Google Ads creative upload requires at least one headline and one description.",
                    new { error = "missing_google_ads_copy" });
            }

            var request = new
            {
                ad_group_id = adGroupId,
                headlines = headlines.Take(15).ToArray(),
                descriptions = descriptions.Take(4).ToArray(),
                final_url = finalUrl,
                account_id = action.IntegrationConnection?.AccountId ?? string.Empty
            };

            return await PostProviderActionAsync(
                "/api/v1/ads/ads/create-rsa",
                request,
                "Google Ads responsive search ad submitted.",
                "Google Ads responsive search ad failed.",
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Google Ads creative live execution exception.");
            return Fail("live", "Google Ads creative live execution failed.", new { error = "provider_exception", detail = ex.Message });
        }
    }

    private async Task<ActionProviderExecutionResult> PostProviderActionAsync(
        string path,
        object request,
        string successMessage,
        string failureMessage,
        CancellationToken cancellationToken)
    {
        using var response = await _httpClient.PostAsJsonAsync(path, request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Provider action call failed for {Path} with status {StatusCode}: {Body}",
                path,
                response.StatusCode,
                TrimTo(responseBody, 700));
            return Fail(
                "live",
                $"{failureMessage} Provider returned {(int)response.StatusCode} {response.StatusCode}.",
                new { error = "provider_http_error", status = (int)response.StatusCode, body = TrimTo(responseBody, 700) });
        }

        using var document = JsonDocument.Parse(responseBody);
        var root = document.RootElement.Clone();
        var success = IsProviderSuccess(root);

        return new ActionProviderExecutionResult(
            success,
            success ? successMessage : failureMessage,
            root,
            new { timestamp = DateTime.UtcNow },
            "live");
    }

    private static ActionProviderExecutionResult ExecuteDryRun(SuggestedAction action)
    {
        var payload = ParsePayload(action.Payload);
        return action.ActionType switch
        {
            "reply_to_google_review" => Ok(
                "dry-run",
                "Google Business review reply validated for dry-run.",
                new { status = "dry_run", provider = "GoogleBusiness" },
                new { wouldPublish = true, replyLength = GetString(payload, "reply_text").Length }),
            "create_instagram_content_plan" or "schedule_instagram_posts" => Ok(
                "dry-run",
                "Instagram content plan validated for dry-run.",
                new { status = "dry_run", provider = "Instagram" },
                new { wouldCreateDrafts = true, itemCount = CountItems(payload, "ideas", "posts") }),
            "apply_budget_optimization" => DryRunGoogleAdsBudget(payload),
            "apply_campaign_recommendations" => Ok(
                "dry-run",
                "Google Ads recommendations validated for dry-run.",
                new { status = "dry_run", provider = "GoogleAds" },
                new { recommendationCount = CountItems(payload, "recommendations", "budget_changes") }),
            "create_ad_creatives" => Ok(
                "dry-run",
                "Google Ads creatives validated for dry-run.",
                new { status = "dry_run", provider = "GoogleAds" },
                new { creativeCount = CountItems(payload, "creatives", "ads") }),
            "log_analytics_report" or "log_review_analysis" => Ok(
                "dry-run",
                $"Internal action '{action.ActionType}' validated for dry-run.",
                new { status = "dry_run", provider = action.Provider.ToString() },
                new { wouldLog = true, timestamp = DateTime.UtcNow }),
            _ => Ok(
                "dry-run",
                $"Action '{action.ActionType}' validated for dry-run.",
                new { status = "dry_run" },
                new { timestamp = DateTime.UtcNow })
        };
    }

    private static ActionProviderExecutionResult DryRunGoogleAdsBudget(JsonElement payload)
    {
        decimal totalBefore = 0;
        decimal totalAfter = 0;
        var changeCount = 0;

        if (payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("campaign_changes", out var changes) &&
            changes.ValueKind == JsonValueKind.Array)
        {
            foreach (var change in changes.EnumerateArray())
            {
                totalBefore += GetDecimal(change, "current_budget");
                totalAfter += GetDecimal(change, "recommended_budget");
                changeCount++;
            }
        }

        var budgetNeutral = Math.Abs(totalBefore - totalAfter) < 1m;
        return Ok(
            "dry-run",
            $"Google Ads budget optimization dry-run: {changeCount} campaign change(s), total {totalBefore:F0} -> {totalAfter:F0}.",
            new { status = "dry_run", provider = "GoogleAds", budgetNeutral },
            new { changeCount, totalBefore, totalAfter, budgetNeutral, wouldApply = true });
    }

    private static JsonElement ParsePayload(string payloadJson)
    {
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(payloadJson);
        }
        catch
        {
            return default;
        }
    }

    private static string GetString(JsonElement element, string key)
        => element.ValueKind == JsonValueKind.Object &&
           element.TryGetProperty(key, out var value) &&
           value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static JsonElement GetObject(JsonElement element, string key)
        => element.ValueKind == JsonValueKind.Object &&
           element.TryGetProperty(key, out var value) &&
           value.ValueKind == JsonValueKind.Object
            ? value
            : default;

    private static JsonElement GetArray(JsonElement element, string key)
        => element.ValueKind == JsonValueKind.Object &&
           element.TryGetProperty(key, out var value) &&
           value.ValueKind == JsonValueKind.Array
            ? value
            : EmptyArray();

    private static JsonElement EmptyArray()
    {
        using var document = JsonDocument.Parse("[]");
        return document.RootElement.Clone();
    }

    private static bool IsProviderSuccess(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object)
            return false;

        if (response.TryGetProperty("success", out var success))
            return success.ValueKind is JsonValueKind.True;

        if (response.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String)
        {
            var statusText = status.GetString();
            return statusText is "submitted" or "scheduled" or "simulated" or "applied" or "uploaded";
        }

        return false;
    }

    private static string GetConnectionConfigString(SuggestedAction action, string key)
    {
        if (action.IntegrationConnection == null || string.IsNullOrWhiteSpace(action.IntegrationConnection.Configuration))
            return string.Empty;

        try
        {
            var config = JsonSerializer.Deserialize<JsonElement>(action.IntegrationConnection.Configuration);
            return GetString(config, key);
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

    private static decimal GetDecimal(JsonElement element, string key)
        => element.ValueKind == JsonValueKind.Object &&
           element.TryGetProperty(key, out var value) &&
           value.ValueKind == JsonValueKind.Number &&
           value.TryGetDecimal(out var number)
            ? number
            : 0m;

    private static int CountItems(JsonElement payload, string primaryKey, string secondaryKey)
    {
        if (payload.ValueKind != JsonValueKind.Object)
            return 0;

        if (payload.TryGetProperty(primaryKey, out var primary) && primary.ValueKind == JsonValueKind.Array)
            return primary.GetArrayLength();

        if (payload.TryGetProperty(secondaryKey, out var secondary) && secondary.ValueKind == JsonValueKind.Array)
            return secondary.GetArrayLength();

        return 0;
    }

    private static ActionProviderExecutionResult Ok(
        string mode,
        string message,
        object providerResponse,
        object resultData)
        => new(true, message, providerResponse, resultData, mode);

    private static ActionProviderExecutionResult Fail(
        string mode,
        string message,
        object providerResponse)
        => new(false, message, providerResponse, new { timestamp = DateTime.UtcNow }, mode);

    private static string TrimTo(string value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return value.Length <= max ? value : value.Substring(0, max);
    }
}
