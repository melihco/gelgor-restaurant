using System.Text.Json;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Services;

public class TenantOperatingPolicyService : ITenantOperatingPolicyService
{
    private const string BarberSalon = "barber_salon";

    private static readonly Dictionary<string, string> IndustryAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["restaurant"] = "restaurant_cafe",
        ["coffee_shop"] = "restaurant_cafe",
        ["cafe"] = "restaurant_cafe",
        ["barber"] = BarberSalon,
        ["barbershop"] = BarberSalon,
        ["hairdresser"] = BarberSalon,
        ["berber"] = BarberSalon,
        ["kuaför"] = BarberSalon,
        ["kuafor"] = BarberSalon,
    };

    private static readonly HashSet<string> ClientAssetTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "client_photo", "client_result", "service_result", "customer_photo", "expert_photo",
    };

    private static readonly HashSet<string> BeforeAfterAssetTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "before_after", "before_after_image",
    };

    private static readonly IReadOnlyList<TenantCapabilityDefinitionDto> WorkflowCapabilities = new[]
    {
        new TenantCapabilityDefinitionDto(
            "workflow_post_service_client_share", "workflow",
            "İşlem sonrası müşteri paylaşımı", "Traş/kesim sonrası müşteriye özel paylaşım akışı.",
            new[] { "beauty_wellness", BarberSalon, "local_service_business" },
            false, new[] { "personal_data", "before_after" },
            new[] { "expert_photo", "before_after_image" },
            new[] { "post_service_client_result", "gallery_client_upload" }),
        new TenantCapabilityDefinitionDto(
            "gallery_manage", "workflow", "Galeri yönetimi", "Mekan ve marka görselleri.",
            Array.Empty<string>(), true, Array.Empty<string>(),
            new[] { "venue_photo", "hero_image", "product_image" }, Array.Empty<string>()),
        new TenantCapabilityDefinitionDto(
            "gallery_client_upload", "workflow", "Müşteri / sonuç fotoğrafı", "Müşteri veya hizmet sonucu görselleri.",
            new[] { "beauty_wellness", BarberSalon, "healthcare_clinic", "local_service_business" },
            false, new[] { "personal_data" },
            new[] { "expert_photo", "before_after_image" }, Array.Empty<string>()),
        new TenantCapabilityDefinitionDto(
            "gallery_before_after", "workflow", "Önce / sonra görselleri", "Before/after karşılaştırma.",
            new[] { "beauty_wellness", BarberSalon, "healthcare_clinic" },
            false, new[] { "before_after", "health_claim" },
            new[] { "before_after_image" }, Array.Empty<string>()),
        new TenantCapabilityDefinitionDto(
            "post_service_client_result", "content_intent", "Hizmet sonucu paylaşımı",
            "İşlem sonrası müşteri sonucu paylaşımı.",
            new[] { "beauty_wellness", BarberSalon, "local_service_business" },
            false, new[] { "personal_data", "before_after" },
            new[] { "expert_photo", "before_after_image" }, Array.Empty<string>()),
    };

    private static readonly Dictionary<string, TenantGalleryPolicyDto> GalleryByIndustry = new()
    {
        ["restaurant_cafe"] = new(
            new[] { "venue_photo", "hero_image", "product_image", "brand_background", "logo", "team_photo" },
            "blocked", "blocked", 48, false),
        ["beauty_wellness"] = new(
            new[] { "venue_photo", "hero_image", "expert_photo", "before_after_image", "brand_background", "logo", "team_photo" },
            "approval_required", "approval_required", 64, true),
        [BarberSalon] = new(
            new[] { "venue_photo", "hero_image", "expert_photo", "before_after_image", "brand_background", "logo", "team_photo" },
            "approval_required", "approval_required", 72, true),
        ["healthcare_clinic"] = new(
            new[] { "venue_photo", "hero_image", "expert_photo", "brand_background", "logo" },
            "blocked", "approval_required", 40, true),
    };

    private static readonly Dictionary<string, string[]> DefaultNeedsByIndustry = new()
    {
        ["restaurant_cafe"] = new[] { "menu_share", "campaign_offer", "event_announcement", "daily_story", "social_proof" },
        ["beauty_wellness"] = new[] { "service_intro", "campaign_offer", "social_proof", "educational_post", "lead_generation" },
        [BarberSalon] = new[] { "service_intro", "social_proof", "post_service_client_result", "lead_generation", "behind_the_scenes" },
        ["local_service_business"] = new[] { "service_intro", "lead_generation", "social_proof", "educational_post" },
    };

    public IReadOnlyList<TenantCapabilityDefinitionDto> GetCapabilityCatalog(string? industry = null)
    {
        if (string.IsNullOrWhiteSpace(industry))
            return WorkflowCapabilities;

        var playbookId = NormalizeIndustry(industry);
        return WorkflowCapabilities
            .Where(c => c.Industries.Count == 0 || c.Industries.Contains(playbookId, StringComparer.OrdinalIgnoreCase))
            .ToList();
    }

    public TenantOperatingProfileDto ResolveProfile(CompanyProfile profile)
    {
        var playbookId = NormalizeIndustry(profile.Industry);
        var explicitCaps = ParseJsonArray(profile.OperatingCapabilities);
        var contentNeeds = ParseJsonArray(profile.ContentNeeds);
        var eligible = new HashSet<string>(GetCapabilityCatalog(playbookId).Select(c => c.Id), StringComparer.OrdinalIgnoreCase);

        List<string> enabled;
        if (explicitCaps.Count > 0)
            enabled = explicitCaps.Where(eligible.Contains).ToList();
        else if (contentNeeds.Count > 0)
            enabled = contentNeeds.ToList();
        else if (DefaultNeedsByIndustry.TryGetValue(playbookId, out var defaults))
            enabled = defaults.ToList();
        else
            enabled = new List<string> { "service_intro", "social_proof" };

        if (playbookId is BarberSalon or "beauty_wellness")
        {
            foreach (var extra in new[] { "gallery_manage", "gallery_client_upload" })
            {
                if (!enabled.Contains(extra))
                    enabled.Add(extra);
            }
        }
        else if (!enabled.Contains("gallery_manage"))
        {
            enabled.Add("gallery_manage");
        }

        return new TenantOperatingProfileDto(
            profile.TenantId,
            profile.Industry,
            playbookId,
            enabled.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            ResolveGalleryPolicy(profile.GalleryPolicy, playbookId),
            MergeRiskRules(playbookId, ParseRiskRules(profile.RiskRules)),
            profile.CustomRules ?? "");
    }

    public PolicyEvaluationResultDto EvaluateCapability(CompanyProfile profile, string capabilityId)
    {
        var resolved = ResolveProfile(profile);
        if (resolved.EnabledCapabilities.Contains(capabilityId, StringComparer.OrdinalIgnoreCase))
        {
            var known = WorkflowCapabilities.FirstOrDefault(c =>
                string.Equals(c.Id, capabilityId, StringComparison.OrdinalIgnoreCase));
            if (known == null)
                return new("allow", capabilityId, Array.Empty<string>());
        }

        var cap = WorkflowCapabilities.FirstOrDefault(c =>
            string.Equals(c.Id, capabilityId, StringComparison.OrdinalIgnoreCase));
        if (cap == null)
            return new("blocked", capabilityId, new[] { "unknown_capability" });

        if (cap.Industries.Count > 0 && !cap.Industries.Contains(resolved.PlaybookId, StringComparer.OrdinalIgnoreCase))
            return new("blocked", capabilityId, new[] { "industry_not_eligible" });

        if (!resolved.EnabledCapabilities.Contains(capabilityId, StringComparer.OrdinalIgnoreCase))
            return new("blocked", capabilityId, new[] { "capability_disabled" });

        foreach (var req in cap.Requires)
        {
            if (!resolved.EnabledCapabilities.Contains(req, StringComparer.OrdinalIgnoreCase))
                return new("blocked", capabilityId, new[] { $"requires:{req}" });
        }

        var decision = "allow";
        var reasons = new List<string>();
        foreach (var signal in cap.RiskSignals)
        {
            if (resolved.RiskRules.TryGetValue(signal, out var rule))
            {
                if (rule == "blocked")
                    return new("blocked", capabilityId, new[] { $"risk_blocked:{signal}" });
                if (rule == "approval_required")
                {
                    decision = "approval_required";
                    reasons.Add($"risk_approval:{signal}");
                }
            }
        }

        return new(decision, capabilityId, reasons);
    }

    public GalleryAssetPolicyResultDto EvaluateGalleryAsset(CompanyProfile profile, string assetType)
    {
        var resolved = ResolveProfile(profile);
        var normalized = assetType.Trim().ToLowerInvariant();
        var policy = resolved.GalleryPolicy;

        if (!resolved.EnabledCapabilities.Contains("gallery_manage", StringComparer.OrdinalIgnoreCase))
            return new("blocked", normalized, new[] { "gallery_manage_disabled" }, false);

        if (ClientAssetTypes.Contains(normalized))
        {
            if (!resolved.EnabledCapabilities.Contains("gallery_client_upload", StringComparer.OrdinalIgnoreCase))
                return new("blocked", normalized, new[] { "gallery_client_upload_disabled" }, false);
            if (policy.ClientPhotoPolicy == "blocked")
                return new("blocked", normalized, new[] { "client_photos_blocked" }, false);
            var needsApproval = policy.ClientPhotoPolicy == "approval_required";
            return new(policy.ClientPhotoPolicy, normalized,
                needsApproval ? new[] { "client_photos_need_approval" } : Array.Empty<string>(),
                needsApproval);
        }

        if (BeforeAfterAssetTypes.Contains(normalized))
        {
            if (!resolved.EnabledCapabilities.Contains("gallery_before_after", StringComparer.OrdinalIgnoreCase))
                return new("blocked", normalized, new[] { "gallery_before_after_disabled" }, false);
            if (policy.BeforeAfterPolicy == "blocked")
                return new("blocked", normalized, new[] { "before_after_blocked" }, false);
            var needsApproval = policy.BeforeAfterPolicy == "approval_required";
            return new(policy.BeforeAfterPolicy, normalized,
                needsApproval ? new[] { "before_after_need_approval" } : Array.Empty<string>(),
                needsApproval);
        }

        if (policy.AllowedAssetIntents.Contains(normalized, StringComparer.OrdinalIgnoreCase) ||
            normalized is "logo" or "venue_reference" or "hero_image" or "venue_photo")
            return new("allow", normalized, Array.Empty<string>(), false);

        return new("approval_required", normalized, new[] { "asset_type_not_in_allowed_intents" }, true);
    }

    private static string NormalizeIndustry(string industry)
    {
        var value = (industry ?? "").Trim().ToLowerInvariant().Replace(' ', '_').Replace('/', '_');
        if (IndustryAliases.TryGetValue(value, out var aliased))
            return aliased;
        return DefaultNeedsByIndustry.ContainsKey(value) || GalleryByIndustry.ContainsKey(value)
            ? value
            : "local_service_business";
    }

    private static TenantGalleryPolicyDto ResolveGalleryPolicy(string? json, string playbookId)
    {
        var basePolicy = GalleryByIndustry.GetValueOrDefault(playbookId) ?? new TenantGalleryPolicyDto(
            new[] { "venue_photo", "hero_image", "product_image", "brand_background", "logo" },
            "approval_required", "approval_required", 48, false);

        if (string.IsNullOrWhiteSpace(json))
            return basePolicy;

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var allowed = basePolicy.AllowedAssetIntents.ToList();
            if (root.TryGetProperty("allowedAssetIntents", out var intents) && intents.ValueKind == JsonValueKind.Array)
            {
                allowed = intents.EnumerateArray()
                    .Where(e => e.ValueKind == JsonValueKind.String)
                    .Select(e => e.GetString()!)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .ToList();
            }

            return new TenantGalleryPolicyDto(
                allowed,
                root.TryGetProperty("clientPhotoPolicy", out var cp) ? cp.GetString() ?? basePolicy.ClientPhotoPolicy : basePolicy.ClientPhotoPolicy,
                root.TryGetProperty("beforeAfterPolicy", out var ba) ? ba.GetString() ?? basePolicy.BeforeAfterPolicy : basePolicy.BeforeAfterPolicy,
                root.TryGetProperty("maxGalleryPhotos", out var max) && max.TryGetInt32(out var n) && n > 0 ? n : basePolicy.MaxGalleryPhotos,
                root.TryGetProperty("requireConsentMetadata", out var rc) && rc.ValueKind == JsonValueKind.True
                    ? true
                    : basePolicy.RequireConsentMetadata);
        }
        catch
        {
            return basePolicy;
        }
    }

    private static Dictionary<string, string> MergeRiskRules(string playbookId, Dictionary<string, string> profileRules)
    {
        var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (playbookId is "restaurant_cafe")
        {
            foreach (var s in new[] { "price", "discount", "date", "location" })
                merged[s] = "allow";
            foreach (var s in new[] { "price", "discount", "date" })
                merged[s] = "approval_required";
        }
        else if (playbookId is BarberSalon or "beauty_wellness")
        {
            merged["personal_data"] = "approval_required";
            merged["before_after"] = "approval_required";
        }

        foreach (var kv in profileRules)
            merged[kv.Key] = kv.Value;
        return merged;
    }

    private static List<string> ParseJsonArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json)?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .ToList() ?? new();
        }
        catch
        {
            return new();
        }
    }

    private static Dictionary<string, string> ParseRiskRules(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                   ?? new Dictionary<string, string>();
        }
        catch
        {
            return new();
        }
    }
}
