using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Services;

public sealed class PlatformTenantBootstrapRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Slug { get; set; }
    public string Plan { get; set; } = "Starter";
    public string? Industry { get; set; }
    public string? SectorId { get; set; }
    public string? Location { get; set; }
    public string Languages { get; set; } = "tr";
    public string? WebsiteUrl { get; set; }
    public string? InstagramHandle { get; set; }
    public string? Description { get; set; }
    public string? OwnerEmail { get; set; }
    public string? OwnerDisplayName { get; set; }
    public string? OwnerPassword { get; set; }
    public string OwnerRole { get; set; } = "Owner";
    public bool BootstrapSlots { get; set; } = true;
    public bool CreateBrandStub { get; set; } = true;
    public bool ProvisionTrialSubscription { get; set; } = true;
}

public sealed class PlatformTenantBootstrapResult
{
    public Guid TenantId { get; set; }
    public Guid OfficeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public Guid? OwnerUserId { get; set; }
    public string? OwnerEmail { get; set; }
    public bool PythonMirrorOk { get; set; }
    public string? PythonMirrorError { get; set; }
    public object? PythonBootstrap { get; set; }
}

/// <summary>
/// Creates a Nexus tenant + default office/agents/profile and syncs Python mirror.
/// </summary>
public sealed class PlatformTenantBootstrapService
{
    private static readonly string[] AllowedRoles =
        { "Owner", "Admin", "Manager", "Reviewer", "Operator", "Analyst", "Viewer", "User" };

    private readonly NexusDbContext _db;
    private readonly ILocalAuthService _auth;
    private readonly IPlatformCrewClient _crew;

    public PlatformTenantBootstrapService(
        NexusDbContext db,
        ILocalAuthService auth,
        IPlatformCrewClient crew)
    {
        _db = db;
        _auth = auth;
        _crew = crew;
    }

    public async Task<PlatformTenantBootstrapResult> BootstrapAsync(
        PlatformTenantBootstrapRequest request,
        CancellationToken cancellationToken)
    {
        var name = (request.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("name is required");

        var industry = string.IsNullOrWhiteSpace(request.Industry)
            ? (request.SectorId ?? string.Empty).Trim()
            : request.Industry.Trim();
        var sectorId = string.IsNullOrWhiteSpace(request.SectorId)
            ? industry
            : request.SectorId.Trim();

        var slug = string.IsNullOrWhiteSpace(request.Slug)
            ? await UniqueTenantSlugAsync(name, cancellationToken)
            : await UniqueTenantSlugAsync(request.Slug.Trim(), cancellationToken);

        var tenant = new Tenant
        {
            Name = name,
            Slug = slug,
            Plan = string.IsNullOrWhiteSpace(request.Plan) ? "Starter" : request.Plan.Trim(),
            IsActive = true,
        };
        _db.Tenants.Add(tenant);

        var office = new Office
        {
            TenantId = tenant.Id,
            Name = "Main Office",
            Description = "Default SmartAgency workspace",
            IsDefault = true,
            Configuration = "{}",
        };
        _db.Offices.Add(office);
        ProvisionDefaultOfficeAgents(tenant.Id, office.Id);

        var profile = new CompanyProfile
        {
            TenantId = tenant.Id,
            BrandName = name,
            Industry = industry,
            Location = request.Location ?? string.Empty,
            Languages = string.IsNullOrWhiteSpace(request.Languages) ? "tr" : request.Languages.Trim(),
            WebsiteUrl = request.WebsiteUrl ?? string.Empty,
            InstagramHandle = (request.InstagramHandle ?? string.Empty).Trim().TrimStart('@'),
            Description = request.Description ?? string.Empty,
            SetupCompleted = false,
        };
        _db.CompanyProfiles.Add(profile);

        Guid? ownerUserId = null;
        string? ownerEmail = null;
        if (!string.IsNullOrWhiteSpace(request.OwnerEmail))
        {
            var email = NormalizeEmail(request.OwnerEmail);
            var role = NormalizeRole(request.OwnerRole) ?? "Owner";
            var exists = await _db.Users.AnyAsync(u => u.Email.ToLower() == email, cancellationToken);
            if (exists)
                throw new InvalidOperationException("owner_email_already_exists");

            var user = new User
            {
                TenantId = tenant.Id,
                Email = email,
                DisplayName = string.IsNullOrWhiteSpace(request.OwnerDisplayName)
                    ? email.Split('@')[0]
                    : request.OwnerDisplayName.Trim(),
                Role = role,
                InvitedAt = DateTime.UtcNow,
                IsActive = true,
            };
            if (!string.IsNullOrWhiteSpace(request.OwnerPassword))
            {
                if (request.OwnerPassword.Length < 8)
                    throw new ArgumentException("owner_password must be at least 8 characters");
                user.PasswordHash = _auth.HashPassword(request.OwnerPassword);
                user.EmailVerifiedAt = DateTime.UtcNow;
                user.InviteAcceptedAt = DateTime.UtcNow;
            }

            _db.Users.Add(user);
            ownerUserId = user.Id;
            ownerEmail = email;
        }

        if (request.ProvisionTrialSubscription)
            await ProvisionDefaultTrialSubscriptionIfMissingAsync(tenant.Id, cancellationToken);

        await _db.SaveChangesAsync(cancellationToken);

        var result = new PlatformTenantBootstrapResult
        {
            TenantId = tenant.Id,
            OfficeId = office.Id,
            Name = tenant.Name,
            Slug = tenant.Slug,
            Plan = tenant.Plan,
            Industry = industry,
            OwnerUserId = ownerUserId,
            OwnerEmail = ownerEmail,
        };

        // Python mirror: workspace id == Nexus tenant id
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                workspace_id = tenant.Id,
                business_name = name,
                business_type = industry,
                sector_id = string.IsNullOrWhiteSpace(sectorId) ? null : sectorId,
                location = request.Location,
                languages = profile.Languages,
                website_url = string.IsNullOrWhiteSpace(request.WebsiteUrl) ? null : request.WebsiteUrl,
                instagram_handle = string.IsNullOrWhiteSpace(profile.InstagramHandle) ? null : profile.InstagramHandle,
                bootstrap_slots = request.BootstrapSlots,
                create_brand_stub = request.CreateBrandStub,
            });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var upstream = await _crew.SendAsync(
                HttpMethod.Post,
                "/api/v1/platform/bootstrap",
                tenant.Id,
                content,
                cancellationToken);
            var body = await upstream.Content.ReadAsStringAsync(cancellationToken);
            result.PythonMirrorOk = upstream.IsSuccessStatusCode;
            if (upstream.IsSuccessStatusCode)
            {
                try
                {
                    result.PythonBootstrap = JsonSerializer.Deserialize<JsonElement>(body);
                }
                catch
                {
                    result.PythonBootstrap = body;
                }
            }
            else
            {
                result.PythonMirrorError = body.Length > 500 ? body[..500] : body;
            }
        }
        catch (Exception ex)
        {
            result.PythonMirrorOk = false;
            result.PythonMirrorError = ex.Message;
        }

        return result;
    }

    private async Task ProvisionDefaultTrialSubscriptionIfMissingAsync(
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        var hasSubscription = await _db.TenantSubscriptions
            .AnyAsync(s => s.TenantId == tenantId && s.Status != SubscriptionStatus.Cancelled, cancellationToken);
        if (hasSubscription)
            return;

        var package = await _db.PackageDefinitions
            .Where(p => p.IsActive && p.Slug == "performance")
            .FirstOrDefaultAsync(cancellationToken)
            ?? await _db.PackageDefinitions
                .Where(p => p.IsActive)
                .OrderByDescending(p => p.SortOrder)
                .FirstOrDefaultAsync(cancellationToken);

        if (package == null)
            return;

        _db.TenantSubscriptions.Add(new TenantSubscription
        {
            TenantId = tenantId,
            PackageId = package.Id,
            Status = SubscriptionStatus.Trial,
            CurrentPeriodStart = DateTime.UtcNow.Date,
            CurrentPeriodEnd = DateTime.UtcNow.Date.AddMonths(1),
            TasksUsedThisPeriod = 0,
        });
    }

    private async Task<string> UniqueTenantSlugAsync(string tenantName, CancellationToken cancellationToken)
    {
        var baseSlug = Slugify(tenantName);
        var slug = baseSlug;
        var suffix = 2;
        while (await _db.Tenants.AnyAsync(t => t.Slug == slug, cancellationToken))
            slug = $"{baseSlug}-{suffix++}";
        return slug;
    }

    private static string Slugify(string value)
    {
        var chars = value
            .Trim()
            .ToLowerInvariant()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
            .ToArray();
        var slug = string.Join("", chars).Trim('-');
        while (slug.Contains("--", StringComparison.Ordinal))
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return string.IsNullOrWhiteSpace(slug) ? $"tenant-{Guid.NewGuid():n}"[..20] : slug;
    }

    private static string NormalizeEmail(string value) => value.Trim().ToLowerInvariant();

    private static string? NormalizeRole(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : AllowedRoles.FirstOrDefault(r => string.Equals(r, value.Trim(), StringComparison.OrdinalIgnoreCase));

    private void ProvisionDefaultOfficeAgents(Guid tenantId, Guid officeId)
    {
        var commandZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = OfficeZoneType.CommandCenter,
            Name = "Command Center",
            Width = 100,
            Depth = 100,
        };
        var contentZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = OfficeZoneType.ContentStudio,
            Name = "Content Studio",
            PositionX = 100,
            Width = 100,
            Depth = 100,
        };
        var designZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = OfficeZoneType.DesignLab,
            Name = "Design Lab",
            PositionX = 200,
            Width = 100,
            Depth = 100,
        };

        _db.OfficeZones.AddRange(commandZone, contentZone, designZone);
        _db.Agents.AddRange(
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = commandZone.Id,
                AgentType = AgentType.AiCeo,
                Name = "CEO Agent",
                DisplayName = "The CEO",
                Description = "Executive leadership AI agent",
                IsEnabled = true,
                DeskPositionX = 10,
                DeskPositionY = 10,
                SystemPrompt = "You are the AI CEO responsible for strategic decisions.",
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = contentZone.Id,
                AgentType = AgentType.ContentStrategy,
                Name = "Content Strategy",
                DisplayName = "The Content Strategist",
                Description = "Weekly content mission brief and pillar planning",
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 45,
                SystemPrompt = "You decide weekly content priorities before Gram Master creates content.",
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = contentZone.Id,
                AgentType = AgentType.InstagramContentGenerator,
                Name = "Instagram Generator",
                DisplayName = "The Gram Master",
                Description = "Instagram-specific content creation",
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 10,
                SystemPrompt = "You create Instagram content calendars, captions and visual directions.",
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = designZone.Id,
                AgentType = AgentType.SocialMediaDesigner,
                Name = "Social Media Designer",
                DisplayName = "The Social Guru",
                Description = "Social media content and design specialist",
                IsEnabled = true,
                DeskPositionX = 210,
                DeskPositionY = 10,
                SystemPrompt = "You design social media creative direction and campaign assets.",
            });
    }
}
