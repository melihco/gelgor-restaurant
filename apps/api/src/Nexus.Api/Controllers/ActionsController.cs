using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Linq;
using Nexus.Application.Services;
using Nexus.Api.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

/// <summary>
/// SuggestedAction yönetimi:
/// - Agent çalıştıktan sonra oluşan yapılandırılmış aksiyon önerilerini listele
/// - Onayla / Reddet
/// - Execute (gerçek provider'a gönder — şimdilik simülasyon)
/// </summary>
[ApiController]
[Route("api/actions")]
public class ActionsController : ControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IImageGenerationService _imageGenerationService;
    private readonly IBrandLearningService _brandLearningService;
    private readonly IRequestContext _requestContext;
    private readonly IActionProviderExecutor _actionProviderExecutor;
    private readonly IConfiguration _configuration;
    private readonly IPermissionService _permissionService;
    private readonly IUsageQuotaService _usageQuotaService;

    private static readonly IReadOnlyDictionary<string, ActionContract> ActionContracts =
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

    public ActionsController(
        NexusDbContext db,
        IImageGenerationService imageGenerationService,
        IBrandLearningService brandLearningService,
        IRequestContext requestContext,
        IActionProviderExecutor actionProviderExecutor,
        IConfiguration configuration,
        IPermissionService permissionService,
        IUsageQuotaService usageQuotaService)
    {
        _db = db;
        _imageGenerationService = imageGenerationService;
        _brandLearningService = brandLearningService;
        _requestContext = requestContext;
        _actionProviderExecutor = actionProviderExecutor;
        _configuration = configuration;
        _permissionService = permissionService;
        _usageQuotaService = usageQuotaService;
    }

    // ── GET /api/actions ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetActions(
        [FromQuery] string? status = null,
        [FromQuery] string? provider = null,
        CancellationToken ct = default)
    {
        var query = _db.SuggestedActions
            .Include(a => a.Artifact)
            .Where(a => a.TenantId == _requestContext.TenantId)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<ActionStatus>(status, true, out var statusEnum))
            query = query.Where(a => a.Status == statusEnum);

        if (!string.IsNullOrEmpty(provider) && Enum.TryParse<IntegrationProvider>(provider, true, out var providerEnum))
            query = query.Where(a => a.Provider == providerEnum);

        var records = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(100)
            .Select(a => new
            {
                a.Id,
                a.ArtifactId,
                artifactTitle = a.Artifact != null ? a.Artifact.Title : string.Empty,
                a.ActionType,
                provider = a.Provider.ToString(),
                a.ApprovalRequired,
                status = a.Status.ToString(),
                payload = a.Payload,
                a.ApprovedAt,
                a.CreatedAt,
                a.UpdatedAt,
            })
            .ToListAsync(ct);

        var actions = new List<object>(records.Count);
        foreach (var item in records)
        {
            var preview = await BuildRenderedPreviewAsync(item.ActionType, item.payload, item.artifactTitle, ct);
            actions.Add(new
            {
                item.Id,
                item.ArtifactId,
                item.artifactTitle,
                item.ActionType,
                item.provider,
                item.ApprovalRequired,
                item.status,
                item.payload,
                item.ApprovedAt,
                item.CreatedAt,
                item.UpdatedAt,
                renderedPreview = preview
            });
        }

        return Ok(actions);
    }

    // ── GET /api/actions/{id} ────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetAction(Guid id, CancellationToken ct = default)
    {
        var action = await _db.SuggestedActions
            .Include(a => a.Artifact)
            .Include(a => a.IntegrationConnection)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);

        if (action == null) return NotFound();
        var preview = await BuildRenderedPreviewAsync(
            action.ActionType,
            action.Payload,
            action.Artifact?.Title ?? string.Empty,
            ct);

        return Ok(new
        {
            action.Id,
            action.ArtifactId,
            artifactTitle = action.Artifact?.Title ?? string.Empty,
            artifactContent = action.Artifact?.Content ?? string.Empty,
            action.ActionType,
            provider = action.Provider.ToString(),
            action.ApprovalRequired,
            status = action.Status.ToString(),
            payload = action.Payload,
            integrationConnectionId = action.IntegrationConnectionId,
            integrationName = action.IntegrationConnection?.DisplayName ?? string.Empty,
            action.TargetRef,
            action.ApprovedBy,
            action.ApprovedAt,
            action.CreatedAt,
            renderedPreview = preview
        });
    }

    [HttpGet("support-matrix")]
    public IActionResult GetSupportMatrix()
    {
        return Ok(ActionContracts.Select(contract => new
        {
            actionType = contract.Key,
            label = contract.Value.Label,
            provider = contract.Value.Provider?.ToString() ?? "Internal",
            liveSupported = contract.Value.LiveSupported,
            requiredPayloadFields = contract.Value.RequiredPayloadKeys,
        }));
    }

    // ── POST /api/actions/{id}/approve ───────────────────────────────────
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> ApproveAction(Guid id, CancellationToken ct = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ActionsApprove, ct))
            return Forbid();

        var action = await _db.SuggestedActions
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);
        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Pending)
            return BadRequest(new { error = $"Action is already in '{action.Status}' state." });

        action.Status = ActionStatus.Approved;
        action.ApprovedAt = DateTime.UtcNow;
        action.ApprovedBy = _requestContext.UserId;
        action.UpdatedBy = _requestContext.UserId;
        AddAudit("approve", action, new { status = "Approved" });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id, status = "Approved" });
    }

    // ── POST /api/actions/{id}/reject ────────────────────────────────────
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> RejectAction(
        Guid id,
        [FromBody] RejectActionRequest? request = null,
        CancellationToken ct = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ActionsReject, ct))
            return Forbid();

        var action = await _db.SuggestedActions
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);
        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Pending)
            return BadRequest(new { error = $"Action is already in '{action.Status}' state." });

        action.Status = ActionStatus.Rejected;
        action.UpdatedBy = _requestContext.UserId;
        AddAudit("reject", action, new { status = "Rejected", request?.Reason });

        await _db.SaveChangesAsync(ct);
        return Ok(new { id, status = "Rejected" });
    }

    // ── POST /api/actions/{id}/execute ───────────────────────────────────
    /// <summary>
    /// Onaylanmış aksiyonu gerçek provider'a uygula.
    /// Faz 3'e kadar simülasyon modunda çalışır — payload'u loglar, ExecutionJob oluşturur.
    /// </summary>
    [HttpPost("{id:guid}/execute")]
    public async Task<IActionResult> ExecuteAction(
        Guid id,
        [FromQuery] string? mode = null,
        CancellationToken ct = default)
    {
        var action = await _db.SuggestedActions
            .Include(a => a.IntegrationConnection)
            .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == _requestContext.TenantId, ct);

        if (action == null) return NotFound();
        if (action.Status != ActionStatus.Approved &&
            !(action.Status == ActionStatus.Pending && !action.ApprovalRequired))
        {
            return BadRequest(new { error = "Action must be Approved before execution." });
        }

        var validation = ValidateActionPayload(action.ActionType, action.Provider, action.Payload);
        if (!validation.Success)
        {
            return BadRequest(new
            {
                error = validation.Message,
                actionType = action.ActionType,
                provider = action.Provider.ToString()
            });
        }

        var executionMode = string.IsNullOrWhiteSpace(mode)
            ? _configuration["ActionExecution:Mode"] ?? "dry-run"
            : mode;
        if (executionMode.Trim().Equals("live", StringComparison.OrdinalIgnoreCase) &&
            (!ActionContracts.TryGetValue(action.ActionType, out var contract) || !contract.LiveSupported))
        {
            return BadRequest(new
            {
                error = "live_adapter_not_implemented",
                action.ActionType,
                provider = action.Provider.ToString(),
                message = "This action type is not enabled for live execution yet. Use dry-run or choose a supported action."
            });
        }

        var requiredPermission = executionMode.Trim().Equals("live", StringComparison.OrdinalIgnoreCase)
            ? Permissions.ProviderExecuteLive
            : Permissions.ProviderExecuteDryRun;
        if (!await _permissionService.HasPermissionAsync(requiredPermission, ct))
            return Forbid();

        if (executionMode.Trim().Equals("live", StringComparison.OrdinalIgnoreCase))
        {
            var liveQuota = await _usageQuotaService.EnsureLiveProviderActionAllowedAsync(_requestContext.TenantId, ct);
            if (!liveQuota.Allowed)
                return StatusCode(StatusCodes.Status402PaymentRequired, liveQuota);
        }

        var quota = await _usageQuotaService.EnsureProviderActionAllowedAsync(_requestContext.TenantId, ct);
        if (!quota.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, quota);

        // ExecutionJob oluştur
        var job = new Nexus.Domain.Entities.ExecutionJob
        {
            SuggestedActionId = action.Id,
            Status = Nexus.Domain.Enums.ExecutionJobStatus.Running,
            StartedAt = DateTime.UtcNow,
        };
        _db.ExecutionJobs.Add(job);

        var executionResult = await _actionProviderExecutor.ExecuteAsync(action, executionMode, ct);

        job.Status = executionResult.Success
            ? Nexus.Domain.Enums.ExecutionJobStatus.Completed
            : Nexus.Domain.Enums.ExecutionJobStatus.Failed;
        job.CompletedAt = DateTime.UtcNow;
        job.Success = executionResult.Success;
        job.ProviderResponse = JsonSerializer.Serialize(executionResult.ProviderResponse);
        job.ResultData = JsonSerializer.Serialize(executionResult.ResultData);
        job.AuditLog = JsonSerializer.Serialize(new
        {
            executedAt = DateTime.UtcNow,
            actionType = action.ActionType,
            provider = action.Provider.ToString(),
            mode = executionResult.Mode,
        });

        action.Status = executionResult.Success ? ActionStatus.Executed : ActionStatus.Failed;
        if (executionResult.Success && action.ApprovedAt == null)
        {
            action.ApprovedAt = DateTime.UtcNow;
            action.ApprovedBy = _requestContext.UserId;
        }
        action.UpdatedBy = _requestContext.UserId;

        if (executionResult.Success)
        {
            await _brandLearningService.RecordExecutedActionAsync(
                action,
                executionResult.Message,
                _requestContext.UserId,
                ct);
        }
        AddAudit("execute", action, new
        {
            status = action.Status.ToString(),
            executionResult.Mode,
            executionResult.Success,
            executionResult.Message
        });

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            jobId = job.Id,
            actionId = id,
            success = executionResult.Success,
            status = action.Status.ToString(),
            mode = executionResult.Mode,
            message = executionResult.Message,
            providerResponse = executionResult.ProviderResponse,
        });
    }

    // ── Rendered Preview ──────────────────────────────────────────────────
    private async Task<object> BuildRenderedPreviewAsync(
        string actionType,
        string payloadJson,
        string fallbackTitle,
        CancellationToken ct)
    {
        JsonElement payload;
        try
        {
            payload = JsonSerializer.Deserialize<JsonElement>(payloadJson);
        }
        catch
        {
            return new
            {
                kind = "text",
                title = string.IsNullOrWhiteSpace(fallbackTitle) ? "Aksiyon Önizleme" : fallbackTitle,
                summary = payloadJson,
                imageUrl = (string?)null,
                caption = payloadJson,
                hashtags = Array.Empty<string>()
            };
        }

        if (actionType == "reply_to_google_review")
        {
            var reply = payload.TryGetProperty("reply_text", out var replyText)
                ? replyText.GetString() ?? string.Empty
                : string.Empty;
            return new
            {
                kind = "text",
                title = "Google Yorum Yanıtı",
                summary = "Yanıt metni önizlemesi",
                imageUrl = (string?)null,
                caption = reply,
                hashtags = Array.Empty<string>()
            };
        }

        if (actionType == "create_weekly_content_strategy")
        {
            var weeklyTheme = GetString(payload, "weekly_theme", "Haftalık İçerik Stratejisi");
            var missionBrief = GetString(payload, "mission_brief", string.Empty);
            var missingQuestion = GetString(payload, "missing_question", string.Empty);
            var ready = payload.TryGetProperty("ready_for_gram_master", out var readyEl) &&
                        readyEl.ValueKind == JsonValueKind.True;

            return new
            {
                kind = "strategy",
                title = weeklyTheme,
                summary = string.IsNullOrWhiteSpace(missingQuestion)
                    ? missionBrief
                    : $"Eksik bilgi: {missingQuestion}",
                imageUrl = (string?)null,
                caption = missionBrief,
                hashtags = Array.Empty<string>(),
                weeklyTheme,
                missionBrief,
                missingQuestion,
                readyForGramMaster = ready,
                pillarMix = payload.TryGetProperty("pillar_mix", out var pillarMix) ? pillarMix : default,
                recommendedFormats = payload.TryGetProperty("recommended_formats", out var formats) ? formats : default,
                templateUseCases = payload.TryGetProperty("template_use_cases", out var useCases) ? useCases : default,
                assetIntents = payload.TryGetProperty("asset_intents", out var assetIntents) ? assetIntents : default,
            };
        }

        if (actionType is "create_instagram_content_plan" or "schedule_instagram_posts")
        {
            // ── Extract all content ideas for the full plan preview ──────
            var rawIdeas = ExtractContentPlanItems(payload);

            // Filter out malformed "wrapper" ideas where the whole JSON was stuffed into caption
            // (old records produced by earlier action_extractor version)
            var allIdeas = rawIdeas
                .Where(idea =>
                {
                    if (idea.ValueKind != JsonValueKind.Object) return false;
                    var cap = GetStringMulti(idea, new[] { "caption_draft", "caption", "brief", "body", "copy", "text" }, "");
                    // If caption looks like raw JSON/code block, it's a legacy wrapper — skip it and re-parse
                    return !cap.TrimStart().StartsWith("```") && !cap.TrimStart().StartsWith("[{") && !cap.TrimStart().StartsWith("{\"");
                })
                .ToList();

            // If all were filtered (old record), try to re-parse caption of the first raw idea as JSON array
            if (allIdeas.Count == 0 && rawIdeas.Count > 0)
            {
                var legacyCap = GetStringMulti(rawIdeas[0], new[] { "caption_draft", "caption", "brief" }, "");
                var reParsed = TryParseJsonArray(legacyCap);
                if (reParsed != null)
                    allIdeas = reParsed;
            }

            var firstItem = allIdeas.Count > 0 ? allIdeas[0] : default;

            // Content calendar uses theme/brief; ideation uses concept_title/caption_draft.
            var title = GetStringMulti(firstItem, new[] { "concept_title", "title", "theme", "headline", "hook" }, fallbackTitle);
            var caption = GetStringMulti(firstItem, new[] { "caption_draft", "caption", "brief", "body", "copy", "text", "description" }, string.Empty);
            var imagePrompt = GetStringMulti(firstItem, new[] { "visual_direction", "image_prompt" }, $"{title}. {caption}");

            // Hashtags can be a JSON array OR a comma-separated string
            var hashtags = GetHashtags(firstItem);
            var imageUrl = await _imageGenerationService.GenerateImageDataUrlAsync(imagePrompt, ct);

            // Build a summary of the full plan
            var ideaSummaries = allIdeas
                .Select((idea, i) =>
                {
                    var t = GetStringMulti(idea, new[] { "concept_title", "title", "theme", "headline", "hook" }, $"İçerik {i + 1}");
                    var ct2 = GetStringMulti(idea, new[] { "content_type", "type" }, "post");
                    var time = FormatContentPlanPostingTime(idea);
                    return $"{i + 1}. [{ct2.ToUpperInvariant()}] {t}" + (string.IsNullOrEmpty(time) ? "" : $" — {time}");
                })
                .ToList();

            var planSummary = ideaSummaries.Count > 0
                ? string.Join("\n", ideaSummaries)
                : "İçerik planı oluşturuldu";

            return new
            {
                kind = "social",
                title = string.IsNullOrWhiteSpace(title) ? "Instagram İçerik Planı" : title,
                summary = planSummary,
                imageUrl,
                caption,
                hashtags,
                // Pass all ideas for rich UI rendering
                ideas = allIdeas.Select(idea => new
                {
                    contentType = GetStringMulti(idea, new[] { "content_type", "type" }, "post"),
                    contentKind = GetStringMulti(idea, new[] { "content_kind" }, ""),
                    templateUseCase = GetStringMulti(idea, new[] { "template_use_case", "use_case" }, ""),
                    title = GetStringMulti(idea, new[] { "concept_title", "title", "theme", "headline", "hook" }, ""),
                    headline = GetStringMulti(idea, new[] { "headline", "concept_title", "title", "theme", "hook" }, ""),
                    caption = GetStringMulti(idea, new[] { "caption_draft", "caption", "brief", "body", "copy", "text", "description" }, ""),
                    visualDirection = GetStringMulti(idea, new[] { "visual_direction", "image_prompt" }, ""),
                    hashtags = GetHashtags(idea),
                    postingTime = FormatContentPlanPostingTime(idea),
                    eventDate = GetStringMulti(idea, new[] { "event_date", "date", "date_suggestion" }, ""),
                    location = GetStringMulti(idea, new[] { "location", "venue_name", "venue" }, ""),
                    cta = GetStringMulti(idea, new[] { "cta", "call_to_action" }, ""),
                    assetIntent = GetStringMulti(idea, new[] { "asset_intent", "asset_recommendation" }, ""),
                    missingQuestions = GetStringArrayMulti(idea, new[] { "missing_questions", "missingQuestions", "missing_question" }),
                    engagement = GetStringMulti(idea, new[] { "estimated_engagement" }, ""),
                    purpose = GetStringMulti(idea, new[] { "strategic_purpose", "priority" }, ""),
                }).ToArray()
            };
        }

        if (actionType == "create_ad_creatives")
        {
            var allCreatives = ExtractAllItems(payload, "creatives", "ads")
                .Where(c => c.ValueKind == JsonValueKind.Object)
                .ToList();

            if (allCreatives.Count == 0 && HasCreativeLikeFields(payload))
                allCreatives = new List<JsonElement> { payload };

            var platformHuman = FormatAdsPlatform(GetString(payload, "platform", string.Empty));
            var objectiveHuman = FormatAdsObjective(GetString(payload, "objective", string.Empty));

            var n = allCreatives.Count;
            var summaries = allCreatives.Select((c, i) =>
            {
                var h = GetAdHeadline(c);
                var line = string.IsNullOrWhiteSpace(h) ? $"Varyant {i + 1}" : h;
                var b = GetAdBody(c);
                if (string.IsNullOrWhiteSpace(b))
                    return $"{i + 1}. {line}";
                var snippet = b.Length > 100 ? b[..100] + "…" : b;
                return $"{i + 1}. {line} — {snippet}";
            }).ToList();

            var planSummary = n == 0
                ? "Bu yükte ayrıştırılabilir reklam metni bulunamadı."
                : $"{n} reklam metni önizlemesi:\n" + string.Join("\n", summaries);

            var contextBits = new[] { platformHuman, objectiveHuman }
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
            var summaryText = contextBits.Count > 0
                ? string.Join(" · ", contextBits) + "\n\n" + planSummary
                : planSummary;

            var firstItem = n > 0 ? allCreatives[0] : default;
            var title = n > 0 ? GetAdHeadline(firstItem) : string.Empty;
            if (string.IsNullOrWhiteSpace(title))
                title = n > 1 ? $"{n} reklam varyantı" : fallbackTitle;
            if (string.IsNullOrWhiteSpace(title))
                title = "Reklam kreatif önizleme";

            var caption = string.Join(
                "\n\n—\n\n",
                allCreatives.Select((c, i) => FormatAdCreativeCaptionBlock(c, i + 1))
                    .Where(block => !string.IsNullOrWhiteSpace(block)));

            if (string.IsNullOrWhiteSpace(caption))
                caption = planSummary;

            var imagePrompt = n > 0
                ? GetStringMulti(firstItem, new[] { "image_prompt", "visual_direction", "visual_prompt" }, $"{title}. {GetAdBody(firstItem)}")
                : title;
            var imageUrl = await _imageGenerationService.GenerateImageDataUrlAsync(imagePrompt, ct);

            return new
            {
                kind = "ad",
                title,
                summary = summaryText,
                imageUrl,
                caption,
                hashtags = Array.Empty<string>(),
                adCreatives = allCreatives.Select((c, idx) => new
                {
                    index = idx + 1,
                    headline = GetAdHeadline(c),
                    body = GetAdBody(c),
                    description = GetStringMulti(c, new[] { "long_description", "secondary_text", "description_line_2" }, string.Empty),
                    cta = GetStringMulti(c, new[] { "cta", "call_to_action", "callToAction" }, string.Empty),
                }).ToArray()
            };
        }

        if (actionType == "apply_budget_optimization")
        {
            var changes = ExtractAllItems(payload, "campaign_changes", "changes");
            var totalCurrent = GetDecimal(payload, "total_current_daily", 0);
            var totalRecommended = GetDecimal(payload, "total_recommended_daily", 0);
            var projected = GetString(payload, "projected_improvement", string.Empty);

            return new
            {
                kind = "report",
                title = "Google Ads Bütçe Optimizasyonu",
                summary = $"{changes.Count} kampanya için bütçe değişikliği. Günlük toplam: {totalCurrent:F0} -> {totalRecommended:F0}.",
                imageUrl = (string?)null,
                caption = string.IsNullOrWhiteSpace(projected) ? payloadJson : projected,
                hashtags = Array.Empty<string>()
            };
        }

        if (actionType == "log_analytics_report")
        {
            var title = GetString(payload, "title", "Analitik Raporu");
            var summary = GetString(payload, "summary", payloadJson);
            var recommendations = ExtractAllItems(payload, "recommendations", "action_items");

            return new
            {
                kind = "report",
                title,
                summary = recommendations.Count > 0
                    ? $"{summary}\n\nÖneri sayısı: {recommendations.Count}"
                    : summary,
                imageUrl = (string?)null,
                caption = summary,
                hashtags = Array.Empty<string>()
            };
        }

        if (actionType == "log_review_analysis")
        {
            var sentiment = GetString(payload, "sentiment", "neutral");
            var urgency = GetString(payload, "urgency", "medium");
            var rawAnalysis = GetString(payload, "raw_analysis", payloadJson);

            return new
            {
                kind = "report",
                title = "Yorum Analizi",
                summary = $"Duygu: {sentiment} · Öncelik: {urgency}",
                imageUrl = (string?)null,
                caption = rawAnalysis,
                hashtags = Array.Empty<string>()
            };
        }

        var genericSummary = payload.TryGetProperty("summary", out var s)
            ? s.GetString() ?? string.Empty
            : payloadJson;
        return new
        {
            kind = "report",
            title = string.IsNullOrWhiteSpace(fallbackTitle) ? "Aksiyon Önizleme" : fallbackTitle,
            summary = genericSummary,
            imageUrl = (string?)null,
            caption = genericSummary,
            hashtags = Array.Empty<string>()
        };
    }

    private void AddAudit(string operation, SuggestedAction action, object newValues)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            TenantId = _requestContext.TenantId,
            UserId = _requestContext.UserId,
            Action = $"suggested_action.{operation}",
            EntityType = nameof(SuggestedAction),
            EntityId = action.Id,
            OldValues = "{}",
            NewValues = JsonSerializer.Serialize(newValues),
            CreatedBy = _requestContext.UserId,
            UpdatedBy = _requestContext.UserId
        });
    }

    /// <summary>
    /// Tries to parse a raw string (possibly wrapped in ```json ... ```) as a JSON array.
    /// Returns list of JsonElement objects or null on failure.
    /// </summary>
    private static List<JsonElement>? TryParseJsonArray(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var text = raw.Trim();

        // Strip ```json ... ``` code fences
        var codeBlockMatch = System.Text.RegularExpressions.Regex.Match(text, @"```(?:json)?\s*([\s\S]*?)```");
        if (codeBlockMatch.Success)
            text = codeBlockMatch.Groups[1].Value.Trim();

        if (!text.StartsWith("[")) return null;

        // Try 1: strict JSON parse
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
                return doc.RootElement.EnumerateArray()
                    .Select(e => e.Clone())
                    .ToList();
        }
        catch { /* fall through to repair */ }

        // Try 2: repair common LLM JSON issues (unescaped double-quotes inside strings)
        // Strategy: find content_type/concept_title/caption_draft via regex and rebuild clean objects
        var items = TryExtractIdeasViaRegex(text);
        return items.Count > 0 ? items : null;
    }

    private static List<JsonElement> TryExtractIdeasViaRegex(string text)
    {
        var result = new List<JsonElement>();
        // Match each {...} block between top-level array items
        var blockMatches = System.Text.RegularExpressions.Regex.Matches(text, @"\{[\s\S]*?\}(?=\s*,\s*\{|\s*\])");

        foreach (System.Text.RegularExpressions.Match block in blockMatches)
        {
            var raw = block.Value;

            string Extract(string key)
            {
                // Match "key": "value" — stops at line ending or next key boundary
                var m = System.Text.RegularExpressions.Regex.Match(
                    raw, $@"""{key}""\s*:\s*""(.*?)""(?:\s*,|\s*\}})",
                    System.Text.RegularExpressions.RegexOptions.Singleline);
                return m.Success ? m.Groups[1].Value.Replace("\\n", "\n").Trim() : string.Empty;
            }

            var contentType = Extract("content_type");
            var title = Extract("concept_title");
            if (string.IsNullOrEmpty(title)) title = Extract("title");
            var captionDraft = Extract("caption_draft");
            if (string.IsNullOrEmpty(captionDraft)) captionDraft = Extract("caption");
            var hashtags = Extract("hashtags");
            var postTime = Extract("posting_time_suggestion");
            var engagement = Extract("estimated_engagement");
            var purpose = Extract("strategic_purpose");
            var visualDir = Extract("visual_direction");

            if (string.IsNullOrEmpty(contentType) && string.IsNullOrEmpty(title)) continue;

            var safeJson = JsonSerializer.Serialize(new
            {
                content_type = contentType,
                concept_title = title,
                caption_draft = captionDraft,
                hashtags,
                posting_time_suggestion = postTime,
                estimated_engagement = engagement,
                strategic_purpose = purpose,
                visual_direction = visualDir,
            });

            try
            {
                using var doc = JsonDocument.Parse(safeJson);
                result.Add(doc.RootElement.Clone());
            }
            catch { /* skip malformed */ }
        }
        return result;
    }

    /// <summary>Tries multiple field names in order, returns first non-empty match.</summary>
    private static string GetStringMulti(JsonElement element, string[] keys, string fallback)
    {
        if (element.ValueKind != JsonValueKind.Object) return fallback;
        foreach (var key in keys)
        {
            if (element.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String)
            {
                var s = val.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s;
            }
        }
        return fallback;
    }

    private static bool HasCreativeLikeFields(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return false;
        foreach (var key in new[] { "headline", "headline1", "title", "body", "primary_text", "description", "copy", "message" })
        {
            if (payload.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String)
            {
                var s = v.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return true;
            }
        }
        return false;
    }

    private static string GetAdHeadline(JsonElement c)
    {
        if (c.ValueKind != JsonValueKind.Object) return string.Empty;

        var parts = new List<string>();
        for (var i = 1; i <= 5; i++)
        {
            var k = $"headline{i}";
            if (c.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.String)
            {
                var s = el.GetString();
                if (!string.IsNullOrWhiteSpace(s)) parts.Add(s.Trim());
            }
        }
        if (parts.Count > 0) return string.Join(" · ", parts);

        return GetStringMulti(c, new[] { "headline", "title", "hook", "primary_text", "long_headline", "short_headline", "name" }, string.Empty);
    }

    private static string GetAdBody(JsonElement c)
    {
        if (c.ValueKind != JsonValueKind.Object) return string.Empty;
        return GetStringMulti(c, new[] { "body", "description", "copy", "text", "message", "primary_text" }, string.Empty);
    }

    private static string FormatAdCreativeCaptionBlock(JsonElement c, int index)
    {
        var lines = new List<string>();
        var h = GetAdHeadline(c);
        if (!string.IsNullOrWhiteSpace(h)) lines.Add(h);
        var b = GetAdBody(c);
        if (!string.IsNullOrWhiteSpace(b)) lines.Add(b);
        var d = GetStringMulti(c, new[] { "long_description", "secondary_text", "description_line_2" }, string.Empty);
        if (!string.IsNullOrWhiteSpace(d) && !string.Equals(d, b, StringComparison.Ordinal)) lines.Add(d);
        var cta = GetStringMulti(c, new[] { "cta", "call_to_action", "callToAction" }, string.Empty);
        if (!string.IsNullOrWhiteSpace(cta)) lines.Add($"CTA: {cta}");
        if (lines.Count == 0) return string.Empty;
        return $"[{index}]\n" + string.Join("\n", lines);
    }

    private static string FormatAdsPlatform(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var v = raw.Trim().ToLowerInvariant().Replace('-', '_');
        return v switch
        {
            "google_ads" or "googleads" => "Google Ads",
            "meta" or "facebook" or "fb" => "Meta Ads",
            "instagram" => "Instagram / Meta",
            "linkedin" => "LinkedIn Ads",
            "tiktok" => "TikTok Ads",
            "all_channels" => "Çoklu kanal",
            _ => raw.Trim().Replace('_', ' ')
        };
    }

    private static string FormatAdsObjective(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var v = raw.Trim().ToLowerInvariant().Replace('-', '_');
        return v switch
        {
            "weekly_plan" => "Haftalık ticari / kampanya planı",
            "priority_alignment" => "Öncelik sıralaması ve hizalama",
            "conversions" => "Dönüşüm",
            "traffic" => "Trafik",
            "awareness" => "Bilinirlik",
            "reach" => "Erişim",
            _ => raw.Trim().Replace('_', ' ')
        };
    }

    /// <summary>Parses hashtags from either a JSON string array or a comma-separated string value.</summary>
    private static string[] GetHashtags(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object) return Array.Empty<string>();

        if (element.TryGetProperty("hashtags", out var htEl))
        {
            // Array form: ["#tag1", "#tag2"]
            if (htEl.ValueKind == JsonValueKind.Array)
            {
                return htEl.EnumerateArray()
                    .Where(x => x.ValueKind == JsonValueKind.String)
                    .Select(x => x.GetString() ?? string.Empty)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x.StartsWith('#') ? x : $"#{x}")
                    .ToArray();
            }
            // String form: "#tag1, #tag2, tag3"
            if (htEl.ValueKind == JsonValueKind.String)
            {
                var raw = htEl.GetString() ?? string.Empty;
                return raw.Split(new[] { ',', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(t => t.Trim())
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .Select(t => t.StartsWith('#') ? t : $"#{t}")
                    .Take(10)
                    .ToArray();
            }
        }
        return Array.Empty<string>();
    }

    private static string[] GetStringArrayMulti(JsonElement element, string[] keys)
    {
        if (element.ValueKind != JsonValueKind.Object) return Array.Empty<string>();

        foreach (var key in keys)
        {
            if (!element.TryGetProperty(key, out var value)) continue;

            if (value.ValueKind == JsonValueKind.Array)
            {
                return value.EnumerateArray()
                    .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : item.ToString())
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Select(item => item!.Trim())
                    .Take(1)
                    .ToArray();
            }

            if (value.ValueKind == JsonValueKind.String)
            {
                var raw = value.GetString();
                return string.IsNullOrWhiteSpace(raw) ? Array.Empty<string>() : new[] { raw.Trim() };
            }
        }

        return Array.Empty<string>();
    }

    /// <summary>Extracts all items from a JSON array under the given key.</summary>
    private static List<JsonElement> ExtractAllItems(JsonElement payload, string primaryKey, string secondaryKey)
    {
        if (payload.ValueKind != JsonValueKind.Object) return new List<JsonElement>();

        foreach (var key in new[] { primaryKey, secondaryKey })
        {
            if (payload.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array)
                return arr.EnumerateArray().ToList();
        }
        return new List<JsonElement>();
    }

    /// <summary>Content plan payloads may list slots under ideas, posts, schedule, calendar, etc.</summary>
    private static List<JsonElement> ExtractContentPlanItems(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return new List<JsonElement>();

        foreach (var key in new[] { "ideas", "posts", "schedule", "calendar", "entries", "items" })
        {
            if (payload.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array && arr.GetArrayLength() > 0)
                return arr.EnumerateArray().ToList();
        }

        return new List<JsonElement>();
    }

    private static string FormatContentPlanPostingTime(JsonElement idea)
    {
        if (idea.ValueKind != JsonValueKind.Object) return string.Empty;

        var direct = GetStringMulti(idea, new[] { "posting_time_suggestion", "date_suggestion", "date", "time_slot", "scheduled_at" }, "");
        if (!string.IsNullOrWhiteSpace(direct)) return direct;

        if (idea.TryGetProperty("day", out var dayEl))
        {
            if (dayEl.ValueKind == JsonValueKind.Number && dayEl.TryGetInt32(out var dayNum))
                return $"Gün {dayNum}";
            if (dayEl.ValueKind == JsonValueKind.String)
            {
                var s = dayEl.GetString();
                if (!string.IsNullOrWhiteSpace(s) && int.TryParse(s.Trim(), out var parsedDay))
                    return $"Gün {parsedDay}";
            }
        }

        return string.Empty;
    }

    private static JsonElement ExtractFirstItem(JsonElement payload, string primaryKey, string secondaryKey)
    {
        if (payload.ValueKind != JsonValueKind.Object)
            return default;

        if (payload.TryGetProperty(primaryKey, out var primary) &&
            primary.ValueKind == JsonValueKind.Array &&
            primary.GetArrayLength() > 0)
        {
            return primary[0];
        }

        if (payload.TryGetProperty(secondaryKey, out var secondary) &&
            secondary.ValueKind == JsonValueKind.Array &&
            secondary.GetArrayLength() > 0)
        {
            return secondary[0];
        }

        return default;
    }

    private static string GetString(JsonElement element, string key, string fallback)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(key, out var value) &&
            value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() ?? fallback;
        }
        return fallback;
    }

    private static string[] GetStringArray(JsonElement element, string key)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(key, out var value) &&
            value.ValueKind == JsonValueKind.Array)
        {
            return value.EnumerateArray()
                .Where(x => x.ValueKind == JsonValueKind.String)
                .Select(x => x.GetString() ?? string.Empty)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToArray();
        }
        return Array.Empty<string>();
    }

    private static decimal GetDecimal(JsonElement element, string key, decimal fallback)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(key, out var value) &&
            value.ValueKind == JsonValueKind.Number &&
            value.TryGetDecimal(out var number))
        {
            return number;
        }

        return fallback;
    }

    private static SimulationResult ValidateActionPayload(
        string actionType,
        IntegrationProvider provider,
        string payloadJson)
    {
        if (!ActionContracts.TryGetValue(actionType, out var contract))
        {
            return new SimulationResult
            {
                Success = false,
                Message = $"Bilinmeyen action type: {actionType}",
                ProviderResponse = new { error = "unknown_action_type" },
                ResultData = new { }
            };
        }

        if (contract.Provider.HasValue && contract.Provider.Value != provider)
        {
            return new SimulationResult
            {
                Success = false,
                Message = $"Action provider uyumsuz: {actionType} için {contract.Provider.Value} bekleniyor, {provider} geldi.",
                ProviderResponse = new { error = "provider_mismatch" },
                ResultData = new { }
            };
        }

        JsonElement payload;
        try
        {
            payload = JsonSerializer.Deserialize<JsonElement>(payloadJson);
        }
        catch
        {
            return new SimulationResult
            {
                Success = false,
                Message = "Payload geçerli JSON değil.",
                ProviderResponse = new { error = "invalid_json" },
                ResultData = new { }
            };
        }

        if (payload.ValueKind != JsonValueKind.Object)
        {
            return new SimulationResult
            {
                Success = false,
                Message = "Payload JSON object formatında olmalı.",
                ProviderResponse = new { error = "invalid_payload_shape" },
                ResultData = new { }
            };
        }

        var missingKeys = contract.RequiredPayloadKeys
            .Where(key => !HasMeaningfulProperty(payload, key))
            .ToArray();

        if (missingKeys.Length > 0)
        {
            return new SimulationResult
            {
                Success = false,
                Message = $"Payload eksik alan içeriyor: {string.Join(", ", missingKeys)}",
                ProviderResponse = new { error = "missing_required_payload_keys", missingKeys },
                ResultData = new { }
            };
        }

        return new SimulationResult
        {
            Success = true,
            Message = $"{contract.Label} payload doğrulandı.",
            ProviderResponse = new { status = "validated" },
            ResultData = new { }
        };
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

    // ── Simülasyon ───────────────────────────────────────────────────────
    private static SimulationResult SimulateProviderCall(
        string actionType,
        IntegrationProvider provider,
        string payloadJson)
    {
        // Faz 3'te gerçek provider entegrasyonu buraya gelir.
        // Şimdilik payload'u parse edip başarılı yanıt simüle et.
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(payloadJson);
            return actionType switch
            {
                "reply_to_google_review" => new SimulationResult
                {
                    Success = true,
                    Message = "Google Business'a yorum yanıtı gönderildi (simülasyon).",
                    ProviderResponse = new { status = "submitted", reviewId = "sim_" + Guid.NewGuid().ToString("N")[..8] },
                    ResultData = new { published = true, timestamp = DateTime.UtcNow },
                },
                "create_instagram_content_plan" => new SimulationResult
                {
                    Success = true,
                    Message = "Instagram içerik planı oluşturuldu (simülasyon).",
                    ProviderResponse = new { status = "draft_created", postCount = 5 },
                    ResultData = new { saved = true, timestamp = DateTime.UtcNow },
                },
                "create_weekly_content_strategy" => new SimulationResult
                {
                    Success = true,
                    Message = "Haftalık içerik stratejisi onaylandı (simülasyon).",
                    ProviderResponse = new { status = "strategy_approved" },
                    ResultData = new { approved = true, timestamp = DateTime.UtcNow },
                },
                "schedule_instagram_posts" => new SimulationResult
                {
                    Success = true,
                    Message = "Instagram paylaşımları planlandı (simülasyon).",
                    ProviderResponse = new { status = "scheduled" },
                    ResultData = new { scheduled = true, timestamp = DateTime.UtcNow },
                },
                "apply_campaign_recommendations" => ExecuteGoogleAdsRecommendations(payload),
                "create_ad_creatives" => ExecuteGoogleAdsCreatives(payload),
                "apply_budget_optimization" => ExecuteGoogleAdsBudgetOptimization(payload),
                "log_analytics_report" => ExecuteAnalyticsReportLog(payload),
                "log_review_analysis" => ExecuteReviewAnalysisLog(payload),
                _ => new SimulationResult
                {
                    Success = true,
                    Message = $"Aksiyon '{actionType}' tamamlandı (simülasyon).",
                    ProviderResponse = new { status = "ok" },
                    ResultData = new { timestamp = DateTime.UtcNow },
                },
            };
        }
        catch
        {
            return new SimulationResult
            {
                Success = false,
                Message = "Payload parse hatası.",
                ProviderResponse = new { error = "invalid_payload" },
                ResultData = new { },
            };
        }
    }

    private static SimulationResult ExecuteAnalyticsReportLog(JsonElement payload)
    {
        var reportType = GetString(payload, "report_type", "analytics_report");
        var summary = GetString(payload, "summary", string.Empty);
        var recommendations = ExtractAllItems(payload, "recommendations", "action_items");

        return new SimulationResult
        {
            Success = true,
            Message = $"Analitik rapor kaydedildi: {reportType}. {recommendations.Count} öneri takip listesine alındı.",
            ProviderResponse = new { status = "logged", reportType, recommendationCount = recommendations.Count },
            ResultData = new { logged = true, timestamp = DateTime.UtcNow, summary },
        };
    }

    private static SimulationResult ExecuteReviewAnalysisLog(JsonElement payload)
    {
        var sentiment = GetString(payload, "sentiment", "neutral");
        var urgency = GetString(payload, "urgency", "medium");
        var requiresEscalation = payload.TryGetProperty("requires_escalation", out var esc) &&
                                 esc.ValueKind is JsonValueKind.True;

        return new SimulationResult
        {
            Success = true,
            Message = $"Yorum analizi kaydedildi: {sentiment}, öncelik {urgency}.",
            ProviderResponse = new { status = "logged", sentiment, urgency, requiresEscalation },
            ResultData = new { logged = true, timestamp = DateTime.UtcNow },
        };
    }

    private static SimulationResult ExecuteGoogleAdsRecommendations(JsonElement payload)
    {
        var recommendations = new List<object>();
        if (payload.TryGetProperty("recommendations", out var recsEl) && recsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var rec in recsEl.EnumerateArray())
            {
                var action = rec.TryGetProperty("action", out var a) ? a.GetString() : "optimize";
                var campaign = rec.TryGetProperty("campaign", out var c) ? c.GetString() : "unknown";
                recommendations.Add(new { campaign, action, status = "applied" });
            }
        }

        var budgetChanges = new List<object>();
        if (payload.TryGetProperty("budget_changes", out var budgetEl) && budgetEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var change in budgetEl.EnumerateArray())
            {
                budgetChanges.Add(new { status = "applied" });
            }
        }

        return new SimulationResult
        {
            Success = true,
            Message = $"Google Ads: {recommendations.Count} öneri ve {budgetChanges.Count} bütçe değişikliği uygulandı.",
            ProviderResponse = new { status = "applied", recommendations, budgetChanges },
            ResultData = new { applied = true, timestamp = DateTime.UtcNow, recommendationCount = recommendations.Count },
        };
    }

    private static SimulationResult ExecuteGoogleAdsBudgetOptimization(JsonElement payload)
    {
        var appliedChanges = new List<object>();
        decimal totalBefore = 0;
        decimal totalAfter = 0;

        if (payload.TryGetProperty("campaign_changes", out var changesEl) && changesEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var change in changesEl.EnumerateArray())
            {
                var campaignId = change.TryGetProperty("campaign_id", out var cid) ? cid.GetString() : "";
                var campaignName = change.TryGetProperty("campaign_name", out var cn) ? cn.GetString() : "";
                var currentBudget = change.TryGetProperty("current_budget", out var cb) ? cb.GetDecimal() : 0;
                var recommendedBudget = change.TryGetProperty("recommended_budget", out var rb) ? rb.GetDecimal() : 0;
                var changePct = change.TryGetProperty("change_pct", out var cp) ? cp.GetDecimal() : 0;

                totalBefore += currentBudget;
                totalAfter += recommendedBudget;

                appliedChanges.Add(new
                {
                    campaignId,
                    campaignName,
                    previousBudget = currentBudget,
                    newBudget = recommendedBudget,
                    changePct,
                    status = "applied"
                });
            }
        }

        var budgetNeutral = Math.Abs(totalBefore - totalAfter) < 1m;
        var projected = payload.TryGetProperty("projected_improvement", out var pi) ? pi.GetString() : "";

        return new SimulationResult
        {
            Success = true,
            Message = $"Google Ads bütçe optimizasyonu: {appliedChanges.Count} kampanyada değişiklik uygulandı. " +
                      $"Toplam: {totalBefore:F0}₺ → {totalAfter:F0}₺" +
                      (budgetNeutral ? " (bütçe nötr)" : " (toplam değişti)"),
            ProviderResponse = new
            {
                status = "applied",
                changes = appliedChanges,
                totalBefore,
                totalAfter,
                budgetNeutral,
                projectedImprovement = projected
            },
            ResultData = new { applied = true, timestamp = DateTime.UtcNow, changeCount = appliedChanges.Count },
        };
    }

    private static SimulationResult ExecuteGoogleAdsCreatives(JsonElement payload)
    {
        var creativeCount = 0;
        if (payload.TryGetProperty("creatives", out var creativesEl) && creativesEl.ValueKind == JsonValueKind.Array)
            creativeCount = creativesEl.GetArrayLength();

        var platform = payload.TryGetProperty("platform", out var p) ? p.GetString() : "google_ads";
        var objective = payload.TryGetProperty("objective", out var o) ? o.GetString() : "conversions";

        return new SimulationResult
        {
            Success = true,
            Message = $"Google Ads: {creativeCount} reklam kopyası {platform} platformuna yüklendi. Hedef: {objective}.",
            ProviderResponse = new { status = "uploaded", platform, creativeCount, adStatus = "PAUSED" },
            ResultData = new { uploaded = true, timestamp = DateTime.UtcNow, creativeCount },
        };
    }

    private class SimulationResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public object ProviderResponse { get; set; } = new { };
        public object ResultData { get; set; } = new { };
    }

    private sealed record ActionContract(
        string Label,
        IntegrationProvider? Provider,
        bool ApprovalRequired,
        bool LiveSupported,
        string[] RequiredPayloadKeys);
}

public record RejectActionRequest(string? Reason = null);
