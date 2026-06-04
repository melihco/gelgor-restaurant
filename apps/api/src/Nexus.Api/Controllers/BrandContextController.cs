using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/brand-context")]
public class BrandContextController : ControllerBase
{
    private readonly NexusDbContext _db;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;
    private readonly ITenantOperatingPolicyService _operatingPolicyService;

    public BrandContextController(
        NexusDbContext db,
        IRequestContext requestContext,
        IPermissionService permissionService,
        ITenantOperatingPolicyService operatingPolicyService)
    {
        _db = db;
        _requestContext = requestContext;
        _permissionService = permissionService;
        _operatingPolicyService = operatingPolicyService;
    }

    [HttpGet("assets")]
    public async Task<ActionResult<List<TenantMediaAssetDto>>> GetAssets(
        [FromQuery] Guid? officeId = null,
        [FromQuery] string? assetType = null,
        CancellationToken cancellationToken = default)
    {
        var query = _db.TenantMediaAssets
            .AsNoTracking()
            .Where(asset => asset.TenantId == _requestContext.TenantId);

        if (officeId.HasValue)
            query = query.Where(asset => asset.OfficeId == officeId || asset.OfficeId == null);
        if (!string.IsNullOrWhiteSpace(assetType))
            query = query.Where(asset => asset.AssetType == assetType);

        var assets = await query
            .OrderByDescending(asset => asset.OfficeId == officeId)
            .ThenByDescending(asset => asset.Priority)
            .ThenByDescending(asset => asset.CreatedAt)
            .Select(asset => MapAsset(asset))
            .ToListAsync(cancellationToken);

        return Ok(assets);
    }

    [HttpPost("assets")]
    public async Task<ActionResult<TenantMediaAssetDto>> UpsertAsset(
        [FromBody] UpsertTenantMediaAssetRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();
        if (request.OfficeId.HasValue && !await OfficeBelongsToTenantAsync(request.OfficeId.Value, cancellationToken))
            return BadRequest(new { error = "Office does not belong to current tenant." });

        var companyProfile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);
        if (companyProfile == null)
            return BadRequest(new { error = "Company profile required before uploading gallery assets." });

        var galleryPolicy = _operatingPolicyService.EvaluateGalleryAsset(companyProfile, request.AssetType);
        if (galleryPolicy.Decision == "blocked")
            return StatusCode(403, new { error = "Asset type not allowed for this tenant.", policy = galleryPolicy });

        var isApproved = request.IsApproved;
        if (galleryPolicy.ForceUnapproved)
            isApproved = false;

        var asset = new TenantMediaAsset
        {
            TenantId = _requestContext.TenantId,
            OfficeId = request.OfficeId,
            AssetType = request.AssetType.Trim(),
            Url = request.Url.Trim(),
            StorageKey = request.StorageKey.Trim(),
            DisplayName = request.DisplayName.Trim(),
            Description = request.Description.Trim(),
            Tags = NormalizeJson(request.Tags, "[]"),
            UsageContext = request.UsageContext.Trim(),
            IsApproved = isApproved,
            Priority = request.Priority,
            CreatedBy = _requestContext.UserId,
            UpdatedBy = _requestContext.UserId
        };

        _db.TenantMediaAssets.Add(asset);
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(MapAsset(asset));
    }

    [HttpPut("assets/{id:guid}")]
    public async Task<ActionResult<TenantMediaAssetDto>> UpdateAsset(
        Guid id,
        [FromBody] UpsertTenantMediaAssetRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();

        var asset = await _db.TenantMediaAssets
            .FirstOrDefaultAsync(item => item.Id == id && item.TenantId == _requestContext.TenantId, cancellationToken);
        if (asset == null)
            return NotFound();
        if (request.OfficeId.HasValue && !await OfficeBelongsToTenantAsync(request.OfficeId.Value, cancellationToken))
            return BadRequest(new { error = "Office does not belong to current tenant." });

        var companyProfile = await _db.CompanyProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.TenantId == _requestContext.TenantId, cancellationToken);
        if (companyProfile == null)
            return BadRequest(new { error = "Company profile required before updating gallery assets." });

        var galleryPolicy = _operatingPolicyService.EvaluateGalleryAsset(companyProfile, request.AssetType);
        if (galleryPolicy.Decision == "blocked")
            return StatusCode(403, new { error = "Asset type not allowed for this tenant.", policy = galleryPolicy });

        asset.OfficeId = request.OfficeId;
        asset.AssetType = request.AssetType.Trim();
        asset.Url = request.Url.Trim();
        asset.StorageKey = request.StorageKey.Trim();
        asset.DisplayName = request.DisplayName.Trim();
        asset.Description = request.Description.Trim();
        asset.Tags = NormalizeJson(request.Tags, "[]");
        asset.UsageContext = request.UsageContext.Trim();
        asset.IsApproved = galleryPolicy.ForceUnapproved ? false : request.IsApproved;
        asset.Priority = request.Priority;
        asset.UpdatedBy = _requestContext.UserId;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(MapAsset(asset));
    }

    [HttpGet("office-profiles")]
    public async Task<ActionResult<List<OfficeBrandProfileDto>>> GetOfficeProfiles(CancellationToken cancellationToken)
    {
        var profiles = await _db.OfficeBrandProfiles
            .AsNoTracking()
            .Where(profile => profile.TenantId == _requestContext.TenantId)
            .OrderBy(profile => profile.DisplayName)
            .Select(profile => MapOfficeProfile(profile))
            .ToListAsync(cancellationToken);
        return Ok(profiles);
    }

    [HttpPost("office-profiles")]
    public async Task<ActionResult<OfficeBrandProfileDto>> UpsertOfficeProfile(
        [FromBody] UpsertOfficeBrandProfileRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();
        if (!await OfficeBelongsToTenantAsync(request.OfficeId, cancellationToken))
            return BadRequest(new { error = "Office does not belong to current tenant." });

        var profile = await _db.OfficeBrandProfiles
            .FirstOrDefaultAsync(item =>
                item.TenantId == _requestContext.TenantId &&
                item.OfficeId == request.OfficeId,
                cancellationToken);

        if (profile == null)
        {
            profile = new OfficeBrandProfile
            {
                TenantId = _requestContext.TenantId,
                OfficeId = request.OfficeId,
                CreatedBy = _requestContext.UserId
            };
            _db.OfficeBrandProfiles.Add(profile);
        }

        profile.DisplayName = request.DisplayName.Trim();
        profile.Location = request.Location.Trim();
        profile.LogoUrl = request.LogoUrl.Trim();
        profile.BrandColors = request.BrandColors.Trim();
        profile.AccentColors = request.AccentColors.Trim();
        profile.Contact = request.Contact.Trim();
        profile.WebsiteUrl = request.WebsiteUrl.Trim();
        profile.ReservationUrl = request.ReservationUrl.Trim();
        profile.SocialTemplateStyle = request.SocialTemplateStyle.Trim();
        profile.DefaultCta = request.DefaultCta.Trim();
        profile.Configuration = NormalizeJson(request.Configuration, "{}");
        profile.UpdatedBy = _requestContext.UserId;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(MapOfficeProfile(profile));
    }

    [HttpGet("canva-templates")]
    public async Task<ActionResult<List<CanvaTemplateAssignmentDto>>> GetCanvaTemplates(
        [FromQuery] Guid? officeId = null,
        [FromQuery] bool includeDisabled = false,
        CancellationToken cancellationToken = default)
    {
        var query = _db.CanvaTemplateAssignments
            .AsNoTracking()
            .Where(template => template.TenantId == _requestContext.TenantId);

        if (officeId.HasValue)
            query = query.Where(template => template.OfficeId == officeId || template.OfficeId == null);
        if (!includeDisabled)
            query = query.Where(template => template.Enabled);

        var templates = await query
            .OrderByDescending(template => template.OfficeId == officeId)
            .ThenByDescending(template => template.Priority)
            .ThenByDescending(template => template.BrandFitScore)
            .Select(template => MapTemplate(template))
            .ToListAsync(cancellationToken);

        return Ok(templates);
    }

    [HttpPost("canva-templates")]
    public async Task<ActionResult<CanvaTemplateAssignmentDto>> UpsertCanvaTemplate(
        [FromBody] UpsertCanvaTemplateAssignmentRequest request,
        CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.IntegrationsManage, cancellationToken))
            return Forbid();
        if (request.OfficeId.HasValue && !await OfficeBelongsToTenantAsync(request.OfficeId.Value, cancellationToken))
            return BadRequest(new { error = "Office does not belong to current tenant." });

        var template = await _db.CanvaTemplateAssignments
            .FirstOrDefaultAsync(item =>
                item.TenantId == _requestContext.TenantId &&
                item.OfficeId == request.OfficeId &&
                item.CanvaTemplateId == request.CanvaTemplateId,
                cancellationToken);

        if (template == null)
        {
            template = new CanvaTemplateAssignment
            {
                TenantId = _requestContext.TenantId,
                OfficeId = request.OfficeId,
                CanvaTemplateId = request.CanvaTemplateId.Trim(),
                CreatedBy = _requestContext.UserId
            };
            _db.CanvaTemplateAssignments.Add(template);
        }

        template.Name = request.Name.Trim();
        template.ContentKinds = NormalizeJson(request.ContentKinds, "[]");
        template.UseCases = NormalizeJson(request.UseCases, "[]");
        template.TemplateFamilyId = request.TemplateFamilyId.Trim();
        template.AllowedIntents = NormalizeJson(request.AllowedIntents, "[]");
        template.AllowedChannels = NormalizeJson(request.AllowedChannels, "[]");
        template.RequiredAssetIntents = NormalizeJson(request.RequiredAssetIntents, "[]");
        template.RiskTier = NormalizeRiskTier(request.RiskTier);
        template.Status = NormalizeTemplateStatus(request.Status);
        template.ManualApprovalRequired = request.ManualApprovalRequired;
        template.LastReviewedAt = template.Status == "approved" ? DateTime.UtcNow : template.LastReviewedAt;
        template.LastReviewedBy = template.Status == "approved" ? _requestContext.UserId : template.LastReviewedBy;
        template.AspectRatio = request.AspectRatio.Trim();
        template.DatasetContract = NormalizeJson(request.DatasetContract, "{}");
        template.Enabled = request.Enabled;
        template.Priority = request.Priority;
        template.BrandFitScore = request.BrandFitScore;
        template.Notes = request.Notes.Trim();
        template.UpdatedBy = _requestContext.UserId;

        await _db.SaveChangesAsync(cancellationToken);
        return Ok(MapTemplate(template));
    }

    private async Task<bool> OfficeBelongsToTenantAsync(Guid officeId, CancellationToken cancellationToken)
    {
        return await _db.Offices
            .AsNoTracking()
            .AnyAsync(office => office.Id == officeId && office.TenantId == _requestContext.TenantId, cancellationToken);
    }

    private static string NormalizeJson(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;
        try
        {
            System.Text.Json.JsonDocument.Parse(value);
            return value;
        }
        catch
        {
            return fallback;
        }
    }

    private static string NormalizeRiskTier(string? value)
    {
        var normalized = (value ?? "low").Trim().ToLowerInvariant();
        return normalized is "low" or "medium" or "high" or "blocked" ? normalized : "low";
    }

    private static string NormalizeTemplateStatus(string? value)
    {
        var normalized = (value ?? "draft").Trim().ToLowerInvariant();
        return normalized is "draft" or "approved" or "disabled" or "needs_review" ? normalized : "draft";
    }

    private static TenantMediaAssetDto MapAsset(TenantMediaAsset asset) => new(
        asset.Id,
        asset.OfficeId,
        asset.AssetType,
        asset.Url,
        asset.StorageKey,
        asset.DisplayName,
        asset.Description,
        asset.Tags,
        asset.UsageContext,
        asset.IsApproved,
        asset.Priority,
        asset.CreatedAt,
        asset.UpdatedAt);

    private static OfficeBrandProfileDto MapOfficeProfile(OfficeBrandProfile profile) => new(
        profile.Id,
        profile.OfficeId,
        profile.DisplayName,
        profile.Location,
        profile.LogoUrl,
        profile.BrandColors,
        profile.AccentColors,
        profile.Contact,
        profile.WebsiteUrl,
        profile.ReservationUrl,
        profile.SocialTemplateStyle,
        profile.DefaultCta,
        profile.Configuration,
        profile.CreatedAt,
        profile.UpdatedAt);

    private static CanvaTemplateAssignmentDto MapTemplate(CanvaTemplateAssignment template) => new(
        template.Id,
        template.OfficeId,
        template.CanvaTemplateId,
        template.Name,
        template.ContentKinds,
        template.UseCases,
        template.TemplateFamilyId,
        template.AllowedIntents,
        template.AllowedChannels,
        template.RequiredAssetIntents,
        template.RiskTier,
        template.Status,
        template.ManualApprovalRequired,
        template.LastReviewedAt,
        template.LastReviewedBy,
        template.AspectRatio,
        template.DatasetContract,
        template.Enabled,
        template.Priority,
        template.BrandFitScore,
        template.Notes,
        template.CreatedAt,
        template.UpdatedAt);
}
