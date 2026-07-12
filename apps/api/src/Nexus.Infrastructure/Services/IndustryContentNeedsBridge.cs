namespace Nexus.Infrastructure.Services;

/// <summary>
/// Content needs derived from sector slot packs (mirrors apps/web slot-content-needs-bridge.ts).
/// SSOT for DefaultNeedsByIndustry — not legacy Remotion playbooks.
/// </summary>
public static class IndustryContentNeedsBridge
{
    /// <summary>
    /// Default content intents per sector from enabled catalog slot design_template_types.
    /// </summary>
    private static readonly Dictionary<string, string[]> NeedsBySector = new(StringComparer.OrdinalIgnoreCase)
    {
        ["beach_club"] = ["daily_story", "event_announcement", "campaign_offer", "social_proof", "behind_the_scenes"],
        ["restaurant_cafe"] = ["menu_share", "campaign_offer", "event_announcement", "daily_story", "social_proof", "behind_the_scenes"],
        ["coffee_shop"] = ["daily_story", "product_highlight", "campaign_offer", "social_proof", "behind_the_scenes"],
        ["fine_dining"] = ["menu_share", "product_highlight", "event_announcement", "social_proof", "behind_the_scenes"],
        ["hospitality"] = ["daily_story", "product_highlight", "social_proof", "event_announcement", "seasonal_content", "behind_the_scenes"],
        ["hotel_resort"] = ["daily_story", "product_highlight", "social_proof", "event_announcement", "seasonal_content", "behind_the_scenes"],
        ["beauty_wellness"] = ["service_intro", "social_proof", "campaign_offer", "behind_the_scenes", "lead_generation"],
        ["barber_salon"] = ["service_intro", "social_proof", "post_service_client_result", "lead_generation", "behind_the_scenes"],
        ["healthcare_clinic"] = ["educational_post", "service_intro", "social_proof", "lead_generation"],
        ["dental"] = ["educational_post", "service_intro", "social_proof", "lead_generation"],
        ["mental_health_clinic"] = ["educational_post", "service_intro", "social_proof", "lead_generation"],
        ["wedding_event"] = ["event_announcement", "social_proof", "behind_the_scenes", "campaign_offer", "lead_generation"],
        ["local_products_shop"] = ["product_highlight", "behind_the_scenes", "social_proof", "educational_post", "daily_story"],
        ["ecommerce_retail"] = ["product_highlight", "campaign_offer", "seasonal_content", "social_proof", "ad_creative"],
        ["fashion_retail"] = ["product_highlight", "campaign_offer", "seasonal_content", "social_proof", "behind_the_scenes"],
        ["fashion_boutique"] = ["product_highlight", "campaign_offer", "seasonal_content", "social_proof", "behind_the_scenes"],
        ["fitness_gym"] = ["service_intro", "educational_post", "social_proof", "campaign_offer", "lead_generation", "behind_the_scenes"],
        ["fitness"] = ["service_intro", "educational_post", "social_proof", "campaign_offer", "lead_generation", "behind_the_scenes"],
        ["nightclub_lounge"] = ["event_announcement", "daily_story", "campaign_offer", "social_proof", "behind_the_scenes"],
        ["nightclub"] = ["event_announcement", "daily_story", "campaign_offer", "social_proof", "behind_the_scenes"],
        ["real_estate"] = ["product_highlight", "lead_generation", "educational_post", "social_proof", "campaign_offer"],
        ["local_service_business"] = ["service_intro", "lead_generation", "social_proof", "educational_post"],
        ["agency_services"] = ["service_intro", "educational_post", "social_proof", "lead_generation"],
        ["cafe_bakery"] = ["product_highlight", "daily_story", "behind_the_scenes", "social_proof", "campaign_offer"],
        ["bakery_patisserie"] = ["product_highlight", "daily_story", "behind_the_scenes", "social_proof", "campaign_offer"],
        ["automotive"] = ["product_highlight", "campaign_offer", "social_proof", "service_intro", "lead_generation"],
        ["tech_startup"] = ["educational_post", "service_intro", "social_proof", "lead_generation", "behind_the_scenes"],
        ["production_company"] = ["behind_the_scenes", "brand_awareness", "social_proof", "service_intro"],
        ["general_business"] = ["brand_awareness", "service_intro", "social_proof", "educational_post", "lead_generation"],
    };

    public static string[] DeriveContentNeeds(string playbookId)
    {
        if (NeedsBySector.TryGetValue(playbookId, out var needs))
            return needs;
        return NeedsBySector["local_service_business"];
    }
}
