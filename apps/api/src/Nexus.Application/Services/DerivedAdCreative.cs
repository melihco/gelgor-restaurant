using System.Text.Json;

namespace Nexus.Application.Services;

/// <summary>
/// Meta/Google clones of a designed post. Same image, extra rows that must
/// not occupy the tenant Akış first-paint window (newest N artifacts).
/// </summary>
public static class DerivedAdCreative
{
    /// <summary>
    /// PostgreSQL predicate: true when the row is a derived ad clone.
    /// Used before LIMIT so ads do not push organic cards out of the window.
    /// </summary>
    public const string SqlIsClone = """
        (
          coalesce("Metadata"->>'derived_from','') = 'designed_post'
          OR coalesce("Metadata"->>'ad_creative','') IN ('true', 'True')
          OR coalesce("Metadata"->>'production_role','') IN ('paid_ad_creative', 'paid_ad_google_creative')
          OR coalesce("Metadata"->>'pipeline','') IN ('meta_ad', 'google_ad')
          OR coalesce("Metadata"->>'publish_channel','') IN ('meta_ads', 'google_ads')
          OR coalesce("Metadata"->>'ad_platform','') IN ('meta_ads', 'google_ads')
        )
        """;

    public static bool IsClone(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            return IsClone(doc.RootElement);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool IsClone(JsonElement meta)
    {
        if (meta.ValueKind != JsonValueKind.Object) return false;
        if (Str(meta, "derived_from") == "designed_post") return true;
        if (Bool(meta, "ad_creative")) return true;
        var role = Str(meta, "production_role");
        if (role is "paid_ad_creative" or "paid_ad_google_creative") return true;
        var pipeline = Str(meta, "pipeline");
        if (pipeline is "meta_ad" or "google_ad") return true;
        var channel = Str(meta, "publish_channel");
        if (channel is "meta_ads" or "google_ads") return true;
        var platform = Str(meta, "ad_platform");
        return platform is "meta_ads" or "google_ads";
    }

    static string Str(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v)) return "";
        return v.ValueKind == JsonValueKind.String ? v.GetString()?.Trim() ?? "" : "";
    }

    static bool Bool(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v)) return false;
        return v.ValueKind == JsonValueKind.True
            || (v.ValueKind == JsonValueKind.String && string.Equals(v.GetString(), "true", StringComparison.OrdinalIgnoreCase));
    }
}
