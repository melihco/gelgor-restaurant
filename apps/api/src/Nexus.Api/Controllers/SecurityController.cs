using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Services;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/security")]
public class SecurityController : ControllerBase
{
    private static readonly string[] AllowedRoles = { "Owner", "Admin", "Manager", "Reviewer", "Operator", "Analyst", "Viewer", "User" };
    private readonly NexusDbContext _db;
    private readonly ILocalAuthService _authService;
    private readonly IPermissionService _permissionService;
    private readonly IRequestContext _requestContext;

    public SecurityController(
        NexusDbContext db,
        ILocalAuthService authService,
        IPermissionService permissionService,
        IRequestContext requestContext)
    {
        _db = db;
        _authService = authService;
        _permissionService = permissionService;
        _requestContext = requestContext;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthSessionDto>> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { error = "email and password are required." });

        if (request.Password.Length < 8)
            return BadRequest(new { error = "password must be at least 8 characters." });

        var email = NormalizeEmail(request.Email);
        var existingUser = await _db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == email, cancellationToken);

        User user;
        if (existingUser != null)
        {
            if (!string.IsNullOrWhiteSpace(existingUser.PasswordHash))
                return Conflict(new { error = "A user with this email already exists." });

            user = existingUser;
            user.DisplayName = request.DisplayName?.Trim() ?? user.DisplayName;
            user.PasswordHash = _authService.HashPassword(request.Password);
            user.EmailVerifiedAt = DateTime.UtcNow;
            user.InviteAcceptedAt = DateTime.UtcNow;
            user.IsActive = true;
        }
        else
        {
            var tenantName = string.IsNullOrWhiteSpace(request.TenantName)
                ? request.DisplayName?.Trim() ?? email.Split('@')[0]
                : request.TenantName.Trim();
            var tenant = new Tenant
            {
                Name = tenantName,
                Slug = await UniqueTenantSlugAsync(tenantName, cancellationToken),
                Plan = "Starter",
                IsActive = true,
            };
            _db.Tenants.Add(tenant);

            var office = new Office
            {
                TenantId = tenant.Id,
                Name = "Main Office",
                Description = "Default SmartAgency workspace",
                IsDefault = true,
                Configuration = "{}"
            };
            _db.Offices.Add(office);
            ProvisionDefaultOfficeAgents(tenant.Id, office.Id);

            user = new User
            {
                TenantId = tenant.Id,
                Email = email,
                DisplayName = request.DisplayName?.Trim() ?? email.Split('@')[0],
                Role = "Owner",
                PasswordHash = _authService.HashPassword(request.Password),
                EmailVerifiedAt = DateTime.UtcNow,
                InviteAcceptedAt = DateTime.UtcNow,
                IsActive = true
            };
            _db.Users.Add(user);
        }

        await ProvisionDefaultTrialSubscriptionIfMissingAsync(user.TenantId, cancellationToken);
        await ProvisionDefaultBriefAndTaskAsync(user.TenantId, user.Id, cancellationToken);

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var officeId = await GetDefaultOfficeIdAsync(user.TenantId, cancellationToken);
        var token = _authService.CreateSessionToken(user, officeId);
        _authService.AppendSessionCookie(Response, token);

        return Ok(ToSession(user, officeId, token));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthSessionDto>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(request.Email);
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.IsActive, cancellationToken);

        if (user == null ||
            string.IsNullOrWhiteSpace(user.PasswordHash) ||
            !_authService.VerifyPassword(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { error = "Invalid email or password." });
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var officeId = await GetDefaultOfficeIdAsync(user.TenantId, cancellationToken);
        var token = _authService.CreateSessionToken(user, officeId);
        _authService.AppendSessionCookie(Response, token);

        return Ok(ToSession(user, officeId, token));
    }

    [HttpPost("logout")]
    public ActionResult Logout()
    {
        _authService.ClearSessionCookie(Response);
        return Ok(new { status = "signed_out" });
    }

    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserSecurityDto>> GetCurrentUser(CancellationToken cancellationToken)
    {
        var user = await _permissionService.GetCurrentUserAsync(cancellationToken);
        return Ok(user);
    }

    [HttpGet("users")]
    public async Task<ActionResult<List<UserAdminDto>>> GetUsers(CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.UsersManage, cancellationToken))
            return Forbid();

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => u.TenantId == _requestContext.TenantId)
            .OrderBy(u => u.DisplayName)
            .Select(u => new UserAdminDto(
                u.Id,
                u.Email,
                u.DisplayName,
                u.Role,
                u.IsActive,
                u.LastLoginAt,
                u.InvitedAt,
                u.InviteAcceptedAt))
            .ToListAsync(cancellationToken);

        return Ok(users);
    }

    [HttpPost("invites")]
    public async Task<ActionResult<UserAdminDto>> InviteUser([FromBody] InviteUserRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.UsersManage, cancellationToken))
            return Forbid();

        var role = NormalizeRole(request.Role);
        if (role == null)
            return BadRequest(new { error = "Unsupported role." });

        var email = NormalizeEmail(request.Email);
        var exists = await _db.Users.AnyAsync(
            u => u.TenantId == _requestContext.TenantId && u.Email.ToLower() == email,
            cancellationToken);
        if (exists)
            return Conflict(new { error = "User already exists in this tenant." });

        var user = new User
        {
            TenantId = _requestContext.TenantId,
            Email = email,
            DisplayName = request.DisplayName?.Trim() ?? email.Split('@')[0],
            Role = role,
            InvitedAt = DateTime.UtcNow,
            IsActive = true
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(ToAdminDto(user));
    }

    [HttpPut("users/{id:guid}/role")]
    public async Task<ActionResult<UserAdminDto>> UpdateRole(Guid id, [FromBody] UpdateUserRoleRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.UsersManage, cancellationToken))
            return Forbid();

        var role = NormalizeRole(request.Role);
        if (role == null)
            return BadRequest(new { error = "Unsupported role." });

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == id && u.TenantId == _requestContext.TenantId,
            cancellationToken);
        if (user == null)
            return NotFound();

        user.Role = role;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(ToAdminDto(user));
    }

    [HttpPut("users/{id:guid}/active")]
    public async Task<ActionResult<UserAdminDto>> UpdateActive(Guid id, [FromBody] UpdateUserActiveRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.UsersManage, cancellationToken))
            return Forbid();

        if (id == _requestContext.UserId && !request.IsActive)
            return BadRequest(new { error = "You cannot deactivate your own user." });

        var user = await _db.Users.FirstOrDefaultAsync(
            u => u.Id == id && u.TenantId == _requestContext.TenantId,
            cancellationToken);
        if (user == null)
            return NotFound();

        user.IsActive = request.IsActive;
        await _db.SaveChangesAsync(cancellationToken);
        return Ok(ToAdminDto(user));
    }

    private async Task<Guid> GetDefaultOfficeIdAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var officeId = await _db.Offices
            .Where(o => o.TenantId == tenantId)
            .OrderByDescending(o => o.IsDefault)
            .ThenBy(o => o.CreatedAt)
            .Select(o => o.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (officeId != Guid.Empty)
            return officeId;

        var office = new Office
        {
            TenantId = tenantId,
            Name = "Main Office",
            Description = "Default SmartAgency workspace",
            IsDefault = true,
            Configuration = "{}"
        };
        _db.Offices.Add(office);
        await _db.SaveChangesAsync(cancellationToken);
        return office.Id;
    }

    private async Task<string> UniqueTenantSlugAsync(string tenantName, CancellationToken cancellationToken)
    {
        var baseSlug = Slugify(tenantName);
        var slug = baseSlug;
        var suffix = 2;
        while (await _db.Tenants.AnyAsync(t => t.Slug == slug, cancellationToken))
        {
            slug = $"{baseSlug}-{suffix++}";
        }
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
    private static string? NormalizeRole(string value)
        => AllowedRoles.FirstOrDefault(r => string.Equals(r, value.Trim(), StringComparison.OrdinalIgnoreCase));

    private static AuthSessionDto ToSession(User user, Guid officeId, string token)
        => new(
            token,
            new UserAdminDto(user.Id, user.Email, user.DisplayName, user.Role, user.IsActive, user.LastLoginAt, user.InvitedAt, user.InviteAcceptedAt),
            user.TenantId,
            officeId);

    private static UserAdminDto ToAdminDto(User user)
        => new(user.Id, user.Email, user.DisplayName, user.Role, user.IsActive, user.LastLoginAt, user.InvitedAt, user.InviteAcceptedAt);

    /// <summary>
    /// New workspaces had no <see cref="TenantSubscription"/>, so agent /execute returned
    /// <c>subscription_required</c>. Seed a Performance-tier trial when the tenant has no
    /// non-cancelled subscription — matches default agents (AiCeo, Gram Master, SocialMediaDesigner, …).
    /// </summary>
    private async Task ProvisionDefaultTrialSubscriptionIfMissingAsync(Guid tenantId, CancellationToken cancellationToken)
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

    private async Task ProvisionDefaultBriefAndTaskAsync(Guid tenantId, Guid userId, CancellationToken ct)
    {
        // Skip if a task already exists for this tenant
        var exists = await _db.TaskItems.AnyAsync(t => t.TenantId == tenantId && !t.IsDeleted, ct);
        if (exists) return;

        var brief = new Brief
        {
            TenantId        = tenantId,
            CreatedByUserId = userId,
            Title           = "AI İçerik Üretimi",
            Description     = "Otomatik oluşturulan varsayılan brief.",
            RawContent      = "{}",
            Status          = BriefStatus.Draft,
        };
        _db.Briefs.Add(brief);
        await _db.SaveChangesAsync(ct);

        _db.TaskItems.Add(new TaskItem
        {
            TenantId    = tenantId,
            BriefId     = brief.Id,
            Title       = "İçerik Üretimi",
            Description = "AI tarafından üretilen içerikler için varsayılan görev.",
            AgentType   = AgentType.SocialMediaDesigner,
            Status      = Nexus.Domain.Enums.TaskStatus.Pending,
            Priority    = TaskPriority.Normal,
            CreatedBy   = userId,
            UpdatedBy   = userId,
        });
        await _db.SaveChangesAsync(ct);
    }

    private void ProvisionDefaultOfficeAgents(Guid tenantId, Guid officeId)
    {
        var commandZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = Nexus.Domain.Enums.OfficeZoneType.CommandCenter,
            Name = "Command Center",
            Width = 100,
            Depth = 100
        };
        var contentZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = Nexus.Domain.Enums.OfficeZoneType.ContentStudio,
            Name = "Content Studio",
            PositionX = 100,
            Width = 100,
            Depth = 100
        };
        var designZone = new OfficeZone
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneType = Nexus.Domain.Enums.OfficeZoneType.DesignLab,
            Name = "Design Lab",
            PositionX = 200,
            Width = 100,
            Depth = 100
        };

        _db.OfficeZones.AddRange(commandZone, contentZone, designZone);
        _db.Agents.AddRange(
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = commandZone.Id,
                AgentType = Nexus.Domain.Enums.AgentType.AiCeo,
                Name = "CEO Agent",
                DisplayName = "The CEO",
                Description = "Executive leadership AI agent",
                IsEnabled = true,
                DeskPositionX = 10,
                DeskPositionY = 10,
                SystemPrompt = "You are the AI CEO responsible for strategic decisions."
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = contentZone.Id,
                AgentType = Nexus.Domain.Enums.AgentType.ContentStrategy,
                Name = "Content Strategy",
                DisplayName = "The Content Strategist",
                Description = "Weekly content mission brief and pillar planning",
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 45,
                SystemPrompt = "You decide weekly content priorities before Gram Master creates content."
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = contentZone.Id,
                AgentType = Nexus.Domain.Enums.AgentType.InstagramContentGenerator,
                Name = "Instagram Generator",
                DisplayName = "The Gram Master",
                Description = "Instagram-specific content creation",
                IsEnabled = true,
                DeskPositionX = 110,
                DeskPositionY = 10,
                SystemPrompt = "You create Instagram content calendars, captions and visual directions."
            },
            new Agent
            {
                TenantId = tenantId,
                OfficeId = officeId,
                ZoneId = designZone.Id,
                AgentType = Nexus.Domain.Enums.AgentType.SocialMediaDesigner,
                Name = "Social Media Designer",
                DisplayName = "The Social Guru",
                Description = "Social media content and design specialist",
                IsEnabled = true,
                DeskPositionX = 210,
                DeskPositionY = 10,
                SystemPrompt = "You design social media creative direction and campaign assets."
            });
    }
}

public record RegisterRequest(string Email, string Password, string? DisplayName, string? TenantName);
public record LoginRequest(string Email, string Password);
public record InviteUserRequest(string Email, string? DisplayName, string Role);
public record UpdateUserRoleRequest(string Role);
public record UpdateUserActiveRequest(bool IsActive);
public record AuthSessionDto(string Token, UserAdminDto User, Guid TenantId, Guid OfficeId);
public record UserAdminDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    bool IsActive,
    DateTime? LastLoginAt,
    DateTime? InvitedAt,
    DateTime? InviteAcceptedAt);
