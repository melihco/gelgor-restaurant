namespace Nexus.Infrastructure.Services;

/// <summary>
/// Sector risk defaults — mirrors backend/app/crew/industry_playbooks.py (risky_signals + approval_required_for).
/// Profile RiskRules JSON overrides these per tenant.
/// </summary>
public static class IndustryRiskPlaybooks
{
    private sealed record RiskPlaybook(string[] RiskySignals, string[] ApprovalRequired);

    private static readonly Dictionary<string, RiskPlaybook> ByPlaybook = new(StringComparer.OrdinalIgnoreCase)
    {
        ["restaurant_cafe"] = new(
            ["price", "discount", "date", "location", "limited_availability"],
            ["price", "discount", "date"]),
        ["coffee_shop"] = new(
            ["price", "discount", "date", "location", "limited_availability"],
            ["price", "discount", "date"]),
        ["beauty_wellness"] = new(
            ["before_after", "personal_data", "discount", "health_claim"],
            ["before_after", "personal_data", "health_claim"]),
        ["healthcare_clinic"] = new(
            ["regulated_industry", "health_claim", "before_after", "personal_data"],
            ["health_claim", "before_after", "personal_data"]),
        ["dental"] = new(
            ["regulated_industry", "health_claim", "before_after", "personal_data"],
            ["health_claim", "before_after", "personal_data"]),
        ["real_estate"] = new(
            ["price", "location", "financial_claim", "limited_availability"],
            ["price", "location", "financial_claim"]),
        ["ecommerce_retail"] = new(
            ["price", "discount", "limited_availability", "user_generated_content"],
            ["price", "discount"]),
        ["agency_services"] = new(
            ["financial_claim", "legal_claim"],
            ["financial_claim", "legal_claim"]),
        ["tech_startup"] = new(
            ["financial_claim", "legal_claim", "personal_data"],
            ["financial_claim", "legal_claim"]),
        ["local_service_business"] = new(
            ["price", "location", "personal_data"],
            ["price", "personal_data"]),
        ["local_products_shop"] = new(
            ["price", "health_claim", "origin_claim"],
            ["price", "health_claim"]),
        ["barber_salon"] = new(
            ["personal_data", "before_after", "price"],
            ["personal_data", "before_after"]),
        ["beach_club"] = new(
            ["price", "date", "limited_availability", "alcohol"],
            ["price", "date", "alcohol"]),
        ["nightclub_lounge"] = new(
            ["price", "date", "limited_availability", "alcohol"],
            ["price", "date", "alcohol"]),
        ["nightclub"] = new(
            ["price", "date", "limited_availability", "alcohol"],
            ["price", "date", "alcohol"]),
        ["hotel_resort"] = new(
            ["price", "date", "limited_availability", "location"],
            ["price", "date"]),
        ["hospitality"] = new(
            ["price", "date", "limited_availability", "location"],
            ["price", "date"]),
        ["fitness"] = new(
            ["health_claim", "before_after", "price", "personal_data"],
            ["health_claim", "before_after", "personal_data"]),
        ["fitness_gym"] = new(
            ["health_claim", "before_after", "price", "personal_data"],
            ["health_claim", "before_after", "personal_data"]),
        ["fashion_retail"] = new(
            ["price", "discount", "limited_availability", "user_generated_content"],
            ["price", "discount"]),
        ["fashion_boutique"] = new(
            ["price", "discount", "limited_availability", "user_generated_content"],
            ["price", "discount"]),
        ["cafe_bakery"] = new(
            ["price", "date", "limited_availability"],
            ["price", "date"]),
        ["bakery_patisserie"] = new(
            ["price", "date", "limited_availability"],
            ["price", "date"]),
        ["automotive"] = new(
            ["price", "financial_claim", "limited_availability"],
            ["price", "financial_claim"]),
        ["wedding_event"] = new(
            ["date", "location", "personal_data", "limited_availability"],
            ["date", "personal_data"]),
        ["fine_dining"] = new(
            ["price", "discount", "date", "location", "limited_availability"],
            ["price", "discount", "date"]),
        ["mental_health_clinic"] = new(
            ["regulated_industry", "health_claim", "personal_data"],
            ["health_claim", "personal_data"]),
        ["production_company"] = new(
            ["personal_data", "financial_claim"],
            ["personal_data"]),
        ["general_business"] = new(
            ["price", "location", "personal_data"],
            ["price", "personal_data"]),
    };

    private static readonly RiskPlaybook Fallback = ByPlaybook["local_service_business"];

    public static Dictionary<string, string> BuildDefaultRiskRules(string playbookId)
    {
        var playbook = ByPlaybook.GetValueOrDefault(playbookId) ?? Fallback;
        var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var signal in playbook.RiskySignals)
            merged[signal] = "allow";
        foreach (var signal in playbook.ApprovalRequired)
            merged[signal] = "approval_required";
        return merged;
    }

    public static Dictionary<string, string> MergeWithProfileRules(
        string playbookId,
        Dictionary<string, string> profileRules)
    {
        var merged = BuildDefaultRiskRules(playbookId);
        foreach (var kv in profileRules)
            merged[kv.Key] = kv.Value;
        return merged;
    }

    /// <summary>Onboarding heuristic overlay — tightens rules when content blob mentions offer/event/health.</summary>
    public static void ApplyContentHeuristics(
        Dictionary<string, string> rules,
        string industry,
        IReadOnlyList<string> templateNeeds,
        IReadOnlyList<string> contentPillars)
    {
        var blob = $"{industry} {string.Join(' ', templateNeeds)} {string.Join(' ', contentPillars)}"
            .ToLowerInvariant();

        if (blob.Contains("offer", StringComparison.Ordinal) || blob.Contains("campaign", StringComparison.Ordinal))
        {
            Elevate(rules, "price", "approval_required");
            Elevate(rules, "discount", "approval_required");
            Elevate(rules, "limited_availability", "approval_required");
        }

        if (blob.Contains("event", StringComparison.Ordinal))
        {
            Elevate(rules, "date", "approval_required");
            Elevate(rules, "location", "approval_required");
        }

        if (blob.Contains("health", StringComparison.Ordinal)
            || blob.Contains("clinic", StringComparison.Ordinal)
            || blob.Contains("medical", StringComparison.Ordinal)
            || blob.Contains("sağlık", StringComparison.Ordinal))
        {
            Elevate(rules, "regulated_industry", "approval_required");
            Elevate(rules, "health_claim", "approval_required");
            Elevate(rules, "before_after", "approval_required");
            rules["personal_data"] = "blocked";
        }
    }

    private static void Elevate(Dictionary<string, string> rules, string signal, string decision)
    {
        if (!rules.TryGetValue(signal, out var current) || current == "allow")
            rules[signal] = decision;
    }
}
