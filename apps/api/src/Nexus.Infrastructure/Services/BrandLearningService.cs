using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class BrandLearningService : IBrandLearningService
{
    private readonly NexusDbContext _dbContext;
    private readonly IVectorMemoryService _vectorMemoryService;
    private static readonly string[] StrategicActionTypes =
    {
        "apply_campaign_recommendations",
        "apply_budget_optimization",
        "log_analytics_report"
    };

    public BrandLearningService(
        NexusDbContext dbContext,
        IVectorMemoryService vectorMemoryService)
    {
        _dbContext = dbContext;
        _vectorMemoryService = vectorMemoryService;
    }

    public async Task RecordApprovedArtifactAsync(
        OutputArtifact artifact,
        string comment,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var summary = BuildApprovedSummary(artifact, comment);
        var memory = new BrandMemoryDocument
        {
            TenantId = artifact.TenantId,
            DocumentType = "approved_pattern",
            Title = $"APPROVED • {artifact.Title}",
            Content = summary,
            CreatedBy = userId,
            UpdatedBy = userId
        };
        _dbContext.BrandMemoryDocuments.Add(memory);
        await _vectorMemoryService.UpsertBrandMemoryAsync(memory, cancellationToken);
    }

    public async Task RecordExecutedActionAsync(
        SuggestedAction action,
        string executionSummary,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var category = action.ActionType switch
        {
            "reply_to_google_review" => "customer_voice",
            "create_weekly_content_strategy" or "create_instagram_content_plan" or "schedule_instagram_posts" => "content_strategy",
            "create_ad_creatives" => "creative_strategy",
            "apply_campaign_recommendations" or "apply_budget_optimization" => "campaign_history",
            "log_analytics_report" => "performance_learning",
            _ => "operational_learning"
        };

        var memory = new BrandMemoryDocument
        {
            TenantId = action.TenantId,
            DocumentType = $"executed_action:{category}",
            Title = $"EXECUTED • {action.ActionType}",
            Content =
                $"ActionType: {action.ActionType}\n" +
                $"Provider: {action.Provider}\n" +
                $"ExecutionSummary: {executionSummary}\n" +
                $"PayloadSample: {TrimTo(action.Payload, 900)}",
            CreatedBy = userId,
            UpdatedBy = userId
        };

        _dbContext.BrandMemoryDocuments.Add(memory);
        await _vectorMemoryService.UpsertBrandMemoryAsync(memory, cancellationToken);
    }

    public async Task RecordRejectedArtifactAsync(
        OutputArtifact artifact,
        string comment,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var reason = ClassifyRejectReason(comment, artifact.Content);
        var summary = BuildRejectedSummary(artifact, comment, reason);
        var memory = new BrandMemoryDocument
        {
            TenantId = artifact.TenantId,
            DocumentType = $"reject_reason:{reason}",
            Title = $"REJECTED • {artifact.Title}",
            Content = summary,
            CreatedBy = userId,
            UpdatedBy = userId
        };
        _dbContext.BrandMemoryDocuments.Add(memory);
        await _vectorMemoryService.UpsertBrandMemoryAsync(memory, cancellationToken);
    }

    public async Task<double> CalculateBrandStyleScoreAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        var decisions = await _dbContext.ReviewDecisions
            .Where(d => d.Artifact != null && d.Artifact.TenantId == tenantId)
            .OrderByDescending(d => d.CreatedAt)
            .Take(200)
            .Select(d => d.Status)
            .ToListAsync(cancellationToken);

        if (decisions.Count == 0) return 50d;

        var approved = decisions.Count(x => x == ReviewStatus.Approved);
        var rejected = decisions.Count(x => x == ReviewStatus.Rejected);
        var revision = decisions.Count(x => x == ReviewStatus.RevisionRequested);
        var denom = approved + rejected + revision;
        if (denom == 0) return 50d;

        // Approved +1, revision +0.5, rejected +0
        var weighted = approved + (revision * 0.5);
        var score = (weighted / denom) * 100d;
        return Math.Round(score, 1);
    }

    public async Task<BrandMemoryReindexResult> ReindexBrandMemoryAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        var memories = await _dbContext.BrandMemoryDocuments
            .Where(memory => memory.TenantId == tenantId && !string.IsNullOrWhiteSpace(memory.Content))
            .OrderBy(memory => memory.CreatedAt)
            .ToListAsync(cancellationToken);

        var embedded = 0;
        foreach (var memory in memories)
        {
            var success = await _vectorMemoryService.UpsertBrandMemoryAsync(memory, cancellationToken);
            if (success)
                embedded++;
        }

        if (embedded > 0)
            await _dbContext.SaveChangesAsync(cancellationToken);

        var skipped = memories.Count - embedded;
        var message = embedded > 0
            ? "Brand memory documents were indexed into vector memory."
            : "No documents were indexed. Qdrant/OpenAI may be disabled or unavailable; relational fallback remains active.";

        return new BrandMemoryReindexResult(
            tenantId,
            memories.Count,
            embedded,
            skipped,
            message);
    }

    public async Task<string> BuildPromptEnrichmentAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        var score = await CalculateBrandStyleScoreAsync(tenantId, cancellationToken);

        var profile = await _dbContext.CompanyProfiles
            .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

        var approvedPatterns = await _dbContext.BrandMemoryDocuments
            .Where(m => m.TenantId == tenantId && m.DocumentType == "approved_pattern")
            .OrderByDescending(m => m.CreatedAt)
            .Take(4)
            .Select(m => new { m.Title, m.Content })
            .ToListAsync(cancellationToken);

        var rejectPatterns = await _dbContext.BrandMemoryDocuments
            .Where(m => m.TenantId == tenantId && m.DocumentType.StartsWith("reject_reason:"))
            .OrderByDescending(m => m.CreatedAt)
            .Take(6)
            .Select(m => new { m.DocumentType, m.Content })
            .ToListAsync(cancellationToken);

        var executedActions = await _dbContext.BrandMemoryDocuments
            .Where(m => m.TenantId == tenantId && m.DocumentType.StartsWith("executed_action:"))
            .OrderByDescending(m => m.CreatedAt)
            .Take(8)
            .Select(m => new { m.DocumentType, m.Title, m.Content })
            .ToListAsync(cancellationToken);

        var latestArtifacts = await _dbContext.OutputArtifacts
            .Where(a => a.TenantId == tenantId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new { a.ArtifactType, a.Title, a.Content })
            .ToListAsync(cancellationToken);

        var retrievalQuery = BuildRetrievalQuery(profile, latestArtifacts.Select(x => $"{x.ArtifactType}: {x.Title}"));
        var vectorMemories = await _vectorMemoryService.SearchBrandMemoryAsync(
            tenantId,
            retrievalQuery,
            limit: 4,
            cancellationToken);

        var learnedRules = BuildLearnedRules(approvedPatterns.Select(x => x.Content), rejectPatterns.Select(x => x.Content), executedActions.Select(x => x.Content));
        var profileBlock = BuildProfileIntelligenceBlock(profile);
        var campaignHistoryBlock = BuildCampaignHistoryBlock(
            executedActions
                .Where(x =>
                    x.DocumentType.Contains("campaign_history") ||
                    x.DocumentType.Contains("performance_learning") ||
                    x.DocumentType.Contains("creative_strategy"))
                .Select(x => $"- {x.Title}: {TrimTo(x.Content, 240)}"));
        var retrievalBlock = BuildRetrievalBlock(
            vectorMemories,
            latestArtifacts.Select(x => $"{x.ArtifactType}: {x.Title}\n{TrimTo(x.Content, 260)}"));

        var approvedBlock = approvedPatterns.Count == 0
            ? "- No approved examples yet."
            : string.Join(Environment.NewLine, approvedPatterns.Select(x => $"- {TrimTo(x.Content, 220)}"));

        var rejectBlock = rejectPatterns.Count == 0
            ? "- No reject history yet."
            : string.Join(Environment.NewLine, rejectPatterns.Select(x => $"- [{x.DocumentType.Replace("reject_reason:", "")}] {TrimTo(x.Content, 220)}"));

        return
            "### BRAND INTELLIGENCE ENRICHMENT" + Environment.NewLine +
            "Use this section as operating memory. Prefer rules and patterns over generic best practices." + Environment.NewLine +
            $"Brand Style Score (tenant-specific): {score}/100" + Environment.NewLine + Environment.NewLine +
            profileBlock + Environment.NewLine + Environment.NewLine +
            "Learned brand rules:" + Environment.NewLine +
            learnedRules + Environment.NewLine + Environment.NewLine +
            "Approved output patterns to emulate:" + Environment.NewLine +
            approvedBlock + Environment.NewLine + Environment.NewLine +
            "Rejected output patterns to avoid:" + Environment.NewLine +
            rejectBlock + Environment.NewLine + Environment.NewLine +
            "Campaign/action history to remember:" + Environment.NewLine +
            campaignHistoryBlock + Environment.NewLine + Environment.NewLine +
            "Relevant semantic memory retrieval:" + Environment.NewLine +
            retrievalBlock + Environment.NewLine + Environment.NewLine +
            "Memory policy:" + Environment.NewLine +
            "- Do not copy previous output verbatim unless explicitly asked." + Environment.NewLine +
            "- Reuse successful tone, structure, targeting and CTA patterns." + Environment.NewLine +
            "- Avoid rejected patterns and explain risk when a request conflicts with brand memory.";
    }

    private static string BuildApprovedSummary(OutputArtifact artifact, string comment)
    {
        var cleanContent = TrimTo(artifact.Content, 800);
        return $"Comment: {comment}\nApproved output sample:\n{cleanContent}";
    }

    private static string BuildRejectedSummary(OutputArtifact artifact, string comment, string reason)
    {
        var cleanContent = TrimTo(artifact.Content, 800);
        return $"ReasonCategory: {reason}\nComment: {comment}\nRejected output sample:\n{cleanContent}";
    }

    private static string ClassifyRejectReason(string comment, string content)
    {
        var text = $"{comment} {content}".ToLowerInvariant();

        if (ContainsAny(text, "tone", "ton", "agresif", "fazla resmi", "samimi değil", "style"))
            return "ToneMismatch";
        if (ContainsAny(text, "yanlış", "factual", "hatalı bilgi", "tarih yanlış", "fiyat yanlış"))
            return "FactualIssue";
        if (ContainsAny(text, "hukuk", "legal", "risk", "yasak", "uygunsuz", "ceza"))
            return "LegalRisk";
        if (ContainsAny(text, "marka güvenliği", "brand safety", "siyasi", "hakaret", "nefret"))
            return "BrandSafety";
        if (ContainsAny(text, "görsel", "visual", "renk", "tasarım", "style guide"))
            return "VisualMismatch";
        if (ContainsAny(text, "cta", "çağrı", "dönüşüm", "aksiyon"))
            return "CTAProblem";
        if (ContainsAny(text, "alakasız", "irrelevant", "konu dışı"))
            return "Irrelevant";
        return "Other";
    }

    private static bool ContainsAny(string text, params string[] words)
        => words.Any(text.Contains);

    private static string BuildLearnedRules(
        IEnumerable<string> approvedPatterns,
        IEnumerable<string> rejectPatterns,
        IEnumerable<string> executedActions)
    {
        var approvedText = string.Join(" ", approvedPatterns).ToLowerInvariant();
        var rejectText = string.Join(" ", rejectPatterns).ToLowerInvariant();
        var actionText = string.Join(" ", executedActions).ToLowerInvariant();

        var rules = new List<string>();

        if (ContainsAny(approvedText, "samimi", "warm", "friendly"))
            rules.Add("- Use a warm, human, locally aware tone when speaking to customers.");
        if (ContainsAny(approvedText, "premium", "luxury", "özel", "exclusive"))
            rules.Add("- Keep positioning premium; avoid cheap or generic discount-heavy language.");
        if (ContainsAny(approvedText, "cta", "rezervasyon", "book", "call"))
            rules.Add("- Include one clear CTA, preferably reservation/contact oriented.");
        if (ContainsAny(rejectText, "fazla resmi", "samimi değil", "tone"))
            rules.Add("- Avoid overly formal or robotic wording.");
        if (ContainsAny(rejectText, "hatalı", "yanlış", "factual"))
            rules.Add("- Do not invent factual details such as dates, prices, guarantees or availability.");
        if (ContainsAny(rejectText, "legal", "hukuk", "risk"))
            rules.Add("- Flag legal/compliance uncertainty instead of making definitive claims.");
        if (StrategicActionTypes.Any(actionText.Contains))
            rules.Add("- Connect creative recommendations to measurable campaign or analytics outcomes.");

        if (rules.Count == 0)
        {
            rules.Add("- Preserve the configured brand tone and target audience.");
            rules.Add("- Prefer concrete, actionable recommendations over generic advice.");
            rules.Add("- Avoid repeating previous outputs; adapt the pattern to the current task.");
        }

        return string.Join(Environment.NewLine, rules.Distinct().Take(8));
    }

    private static string BuildProfileIntelligenceBlock(CompanyProfile? profile)
    {
        if (profile == null)
            return "Brand profile intelligence:\n- Company profile is not configured yet.";

        var lines = new List<string>
        {
            "Brand profile intelligence:",
            $"- Brand: {Fallback(profile.BrandName, "Unknown")}",
            $"- Industry: {Fallback(profile.Industry, "Not specified")}",
            $"- Tone of voice: {Fallback(profile.BrandTone, "professional")}",
            $"- Target audience: {Fallback(profile.TargetAudience, "Not specified")}",
            $"- Competitors: {Fallback(profile.Competitors, "Not specified")}",
            $"- Campaign goals: {Fallback(profile.CampaignGoals, "Not specified")}",
            $"- Languages: {Fallback(profile.Languages, "tr")}"
        };

        if (!string.IsNullOrWhiteSpace(profile.BrandAnalysis))
            lines.Add($"- Account-derived brand analysis: {TrimTo(profile.BrandAnalysis, 420)}");

        return string.Join(Environment.NewLine, lines);
    }

    private static string BuildCampaignHistoryBlock(IEnumerable<string> executedActions)
    {
        var items = executedActions
            .Take(5)
            .ToList();

        return items.Count == 0
            ? "- No executed campaign/action history yet."
            : string.Join(Environment.NewLine, items);
    }

    private static string BuildRetrievalQuery(
        CompanyProfile? profile,
        IEnumerable<string> latestArtifactTitles)
    {
        var parts = new List<string>
        {
            profile?.BrandName ?? string.Empty,
            profile?.Industry ?? string.Empty,
            profile?.BrandTone ?? string.Empty,
            profile?.TargetAudience ?? string.Empty,
            profile?.CampaignGoals ?? string.Empty,
            profile?.Competitors ?? string.Empty,
            string.Join(" | ", latestArtifactTitles.Take(5))
        };

        var query = string.Join(" ", parts.Where(part => !string.IsNullOrWhiteSpace(part)));
        return string.IsNullOrWhiteSpace(query)
            ? "brand rules approved patterns rejected patterns campaign history"
            : query;
    }

    private static string BuildRetrievalBlock(
        IReadOnlyList<VectorMemorySearchResult> vectorMemories,
        IEnumerable<string> fallbackCandidates)
    {
        if (vectorMemories.Count > 0)
        {
            var items = vectorMemories
                .Take(4)
                .Select(memory =>
                    $"- [{memory.DocumentType}] {memory.Title} " +
                    $"(score {memory.Score:0.000}): {TrimTo(memory.Content, 300)}")
                .ToList();

            return string.Join(Environment.NewLine, items) +
                   Environment.NewLine +
                   "- Vector memory source: Qdrant semantic retrieval.";
        }

        return BuildLightweightRetrievalFallbackBlock(fallbackCandidates);
    }

    private static string BuildLightweightRetrievalFallbackBlock(IEnumerable<string> candidates)
    {
        var items = candidates
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Take(4)
            .Select(x => $"- {TrimTo(x, 300)}")
            .ToList();

        return items.Count == 0
            ? "- Vector memory is not configured or returned no matches; no recent retrieval candidates yet."
            : string.Join(Environment.NewLine, items) + Environment.NewLine + "- Vector memory source: relational recent-output fallback.";
    }

    private static string Fallback(string value, string fallback)
        => string.IsNullOrWhiteSpace(value) ? fallback : value;

    private static string TrimTo(string value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return value.Length <= max ? value : value.Substring(0, max);
    }
}

