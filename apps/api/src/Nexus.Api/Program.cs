using Microsoft.EntityFrameworkCore;
using Nexus.Api.Hubs;
using Nexus.Application.Interfaces;
using Nexus.Application.Providers;
using Nexus.Application.Services;
using Nexus.Infrastructure.Data;
using Nexus.Infrastructure.Services;
using Nexus.Infrastructure.Data.Configurations;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Api.Services;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

var configuration = builder.Configuration;
static int ClampOrchestrationTimeoutSeconds(IConfiguration config, int fallback = 120)
{
    var t = config.GetValue<int?>("OrchestrationService:TimeoutSeconds") ?? fallback;
    return Math.Clamp(t, 30, 3600);
}

static int ClampActionExecutionTimeoutSeconds(IConfiguration config, int fallback = 90)
{
    var t = config.GetValue<int?>("ActionExecution:TimeoutSeconds") ?? fallback;
    return Math.Clamp(t, 15, 3600);
}

var connectionString = configuration.GetConnectionString("DefaultConnection");

if (!string.IsNullOrEmpty(connectionString))
{
    builder.Services.AddDbContext<NexusDbContext>(options =>
        options.UseNpgsql(connectionString));
}
else
{
    builder.Services.AddDbContext<NexusDbContext>(options =>
        options.UseInMemoryDatabase("NexusDb"));
}

builder.Services.AddScoped<IAiProvider, MockAiProvider>();
builder.Services.AddScoped<IBriefService, BriefService>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<IAgentService, AgentService>();
builder.Services.AddScoped<IArtifactService, ArtifactService>();
builder.Services.AddScoped<IOfficeService, OfficeService>();
builder.Services.AddScoped<IReviewService, ReviewService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IBrandLearningService, BrandLearningService>();
builder.Services.AddHttpClient<IVectorMemoryService, QdrantVectorMemoryService>();
builder.Services.AddHttpClient<IActionProviderExecutor, ActionProviderExecutor>(client =>
{
    var baseUrl = configuration["OrchestrationService:BaseUrl"] ?? "http://localhost:8000";
    var timeoutSeconds = ClampActionExecutionTimeoutSeconds(configuration);
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
    client.DefaultRequestHeaders.Add("X-API-Key", configuration["OrchestrationService:ApiKey"] ?? "smartagency-internal-dev-key");
});
builder.Services.AddScoped<ISetupService, SetupService>();
builder.Services.AddScoped<IPackageService, PackageService>();
builder.Services.AddScoped<IIntegrationService, IntegrationService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IRequestContext, RequestContext>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<ILocalAuthService, LocalAuthService>();
builder.Services.AddScoped<IIntegrationTokenService, IntegrationTokenService>();
builder.Services.AddScoped<IUsageQuotaService, UsageQuotaService>();
builder.Services.AddDataProtection();
builder.Services.AddHttpClient<IImageGenerationService, OpenAiImageGenerationService>();
builder.Services.AddHttpClient("CrewService", client =>
{
    var baseUrl = configuration["OrchestrationService:BaseUrl"] ?? "http://localhost:8000";
    var timeoutSeconds = ClampOrchestrationTimeoutSeconds(configuration);
    var apiKey = configuration["OrchestrationService:ApiKey"] ?? "smartagency-internal-dev-key";

    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
    client.DefaultRequestHeaders.Add("X-Internal-Api-Key", apiKey);
});

var useDevMockOrchestration =
    builder.Environment.IsDevelopment()
    && configuration.GetValue("OrchestrationService:UseDevMock", true);

if (useDevMockOrchestration)
{
    builder.Services.AddScoped<ICrewOrchestrationService, DevMockCrewOrchestrationService>();
}
else
{
    builder.Services.AddHttpClient<ICrewOrchestrationService, CrewOrchestrationService>(client =>
    {
        var baseUrl = configuration["OrchestrationService:BaseUrl"] ?? "http://localhost:8000";
        var timeoutSeconds = ClampOrchestrationTimeoutSeconds(configuration);
        var apiKey = configuration["OrchestrationService:ApiKey"] ?? "smartagency-internal-dev-key";

        client.BaseAddress = new Uri(baseUrl);
        client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        client.DefaultRequestHeaders.Add("X-Internal-Api-Key", apiKey);
    });
}

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors =
        configuration.GetValue<bool?>("SignalR:EnableDetailedErrors")
        ?? builder.Environment.IsDevelopment();
});
builder.Services.AddSingleton<IAgentRunProgressBroadcaster, OfficeHubAgentRunProgressBroadcaster>();
builder.Services.AddHostedService<StaleAgentRunWatchdog>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Nexus AI Agent Office API",
        Version = "v1",
        Description = "Backend API for the AI Agent Office OS SaaS Platform"
    });
});

var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:3000" };
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var tenant = context.Request.Headers["X-Tenant-Id"].FirstOrDefault()
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "anonymous";

        return RateLimitPartition.GetFixedWindowLimiter(
            tenant,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = configuration.GetValue<int?>("RateLimit:PermitLimit") ?? 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            });
    });
});

var app = builder.Build();

app.Logger.LogInformation(
    "Orchestration: UseDevMock={UseDevMock} (Development={IsDev}). {Detail}",
    useDevMockOrchestration,
    app.Environment.IsDevelopment(),
    useDevMockOrchestration
        ? "Python’a HTTP gitmez; DevMock anında yanıt üretir. Gerçek Crew için appsettings’te UseDevMock=false ve uvicorn :8000."
        : $"Python hedefi: {configuration["OrchestrationService:BaseUrl"] ?? "http://localhost:8000"} (POST /internal/v1/orchestration/execute).");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Nexus API v1");
        options.RoutePrefix = string.Empty;
    });
}

app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    var authService = context.RequestServices.GetRequiredService<ILocalAuthService>();
    var token = context.Request.Cookies[LocalAuthService.SessionCookieName];

    if (string.IsNullOrWhiteSpace(token))
    {
        var authorization = context.Request.Headers.Authorization.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(authorization) &&
            authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            token = authorization["Bearer ".Length..].Trim();
        }
    }

    if (!string.IsNullOrWhiteSpace(token) &&
        authService.TryValidateToken(token, out var principal))
    {
        context.User = principal;
    }

    await next();
});
app.Use(async (context, next) =>
{
    var correlationId = context.Request.Headers["X-Correlation-Id"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(correlationId))
        correlationId = Guid.NewGuid().ToString("n");

    context.Items["CorrelationId"] = correlationId;
    context.Response.Headers["X-Correlation-Id"] = correlationId;

    using (app.Logger.BeginScope(new Dictionary<string, object>
    {
        ["CorrelationId"] = correlationId
    }))
    {
        await next();
    }
});
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var isAnonymousPath =
        path.StartsWithSegments("/health") ||
        path.StartsWithSegments("/swagger") ||
        path == "/" ||
        path.StartsWithSegments("/api/security/login") ||
        path.StartsWithSegments("/api/security/register") ||
        path.StartsWithSegments("/api/security/logout") ||
        path.StartsWithSegments("/api/integrations/google/callback");

    if (!isAnonymousPath && (path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs")))
    {
        var requestContext = context.RequestServices.GetRequiredService<IRequestContext>();
        if (requestContext.TenantId == Guid.Empty || requestContext.UserId == Guid.Empty)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Authenticated tenant and user context is required.",
                hint = "Configure JWT claims or enable trusted client headers/demo fallback for development."
            });
            return;
        }
    }

    await next();
});

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "nexus-api",
    timestamp = DateTime.UtcNow
}));

app.MapGet("/health/live", () => Results.Ok(new
{
    status = "ok",
    service = "nexus-api",
    check = "live",
    timestamp = DateTime.UtcNow
}));

app.MapGet("/health/ready", async (
    NexusDbContext dbContext,
    IHttpClientFactory httpClientFactory,
    IVectorMemoryService vectorMemoryService,
    IConfiguration config,
    CancellationToken cancellationToken) =>
{
    var checks = new Dictionary<string, object>();
    var ready = true;

    try
    {
        var dbReady = await dbContext.Database.CanConnectAsync(cancellationToken);
        checks["database"] = new { status = dbReady ? "ok" : "failed" };
        ready &= dbReady;
    }
    catch (Exception ex)
    {
        checks["database"] = new { status = "failed", error = ex.GetType().Name };
        ready = false;
    }

    var useDevMockOrchestration =
        app.Environment.IsDevelopment()
        && config.GetValue("OrchestrationService:UseDevMock", true);

    if (useDevMockOrchestration)
    {
        checks["orchestration"] = new { status = "skipped", reason = "UseDevMock — Python servisi doğrulanmadı" };
    }
    else
    {
        try
        {
            var crewClient = httpClientFactory.CreateClient("CrewService");
            using var response = await crewClient.GetAsync("/health", cancellationToken);
            checks["orchestration"] = new { status = response.IsSuccessStatusCode ? "ok" : "failed", code = (int)response.StatusCode };
            ready &= response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            checks["orchestration"] = new { status = "failed", error = ex.GetType().Name };
            ready = false;
        }
    }

    var vectorStatus = await vectorMemoryService.GetStatusAsync(cancellationToken);
    checks["vectorMemory"] = new
    {
        status = !vectorStatus.Enabled || vectorStatus.QdrantReachable ? "ok" : "degraded",
        vectorStatus.Enabled,
        vectorStatus.QdrantReachable,
        vectorStatus.EmbeddingProviderConfigured,
        vectorStatus.Collection
    };

    checks["configuration"] = new
    {
        environment = app.Environment.EnvironmentName,
        actionExecutionMode = config["ActionExecution:Mode"] ?? "dry-run",
        frontendConfigured = !string.IsNullOrWhiteSpace(config["Frontend:BaseUrl"])
    };

    return Results.Json(new
    {
        status = ready ? "ok" : "degraded",
        service = "nexus-api",
        check = "ready",
        timestamp = DateTime.UtcNow,
        checks
    }, statusCode: ready ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
});

app.MapControllers();
app.MapHub<OfficeHub>("/hubs/office").DisableRateLimiting();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<NexusDbContext>();

    if (dbContext.Database.ProviderName != "Microsoft.EntityFrameworkCore.InMemory")
    {
        try
        {
            await dbContext.Database.EnsureCreatedAsync();
            // Apply any schema patches for columns added after initial EnsureCreated
            await ApplySchemaPatches(dbContext);
            await SeedData.SeedAsync(dbContext);

            var isDev = app.Environment.IsDevelopment();
            var ensureSeedLogin = app.Configuration.GetValue("Auth:EnsureSeedAdminLogin", false);
            var resetDevSeedPassword = app.Configuration.GetValue("Auth:ResetDevSeedPassword", false);
            await SeedData.EnsureDevSeedAdminCredentialsAsync(
                dbContext,
                forceReset: isDev || resetDevSeedPassword,
                fillEmptyOnly: ensureSeedLogin);

            await ApplyDataPatches(dbContext);
        }
        catch (Exception ex)
        {
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            logger.LogError(ex, "An error occurred while migrating or seeding the database.");
            throw;
        }
    }
}

app.Run();

static async Task ApplySchemaPatches(NexusDbContext ctx)
{
    // Idempotent column additions for fields added after the initial EnsureCreated
    var patches = new[]
    {
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"InstagramHandle\" varchar(100) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"GoogleBusinessUrl\" varchar(500) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"BrandImageUrls\" varchar(2000) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"BrandAnalysis\" text NOT NULL DEFAULT '';",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='CompanyProfiles' AND column_name='BrandAnalysis' AND data_type='character varying') THEN ALTER TABLE \"CompanyProfiles\" ALTER COLUMN \"BrandAnalysis\" TYPE text; END IF; END $$;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"BrandAnalyzedAt\" timestamp with time zone;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"PrimaryFont\" varchar(100) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"SecondaryFont\" varchar(100) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"BrandColors\" varchar(500) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"AccentColors\" varchar(500) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"SocialTemplateStyle\" varchar(1000) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"LogoUsageRules\" varchar(1000) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"PlatformProfiles\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"ContentNeeds\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"TemplateFamilies\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"RiskRules\" jsonb NOT NULL DEFAULT '{{}}'::jsonb;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"CustomerVisibleSummary\" varchar(2000) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"SystemIntelligence\" text NOT NULL DEFAULT '';",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='CompanyProfiles' AND column_name='SystemIntelligence' AND data_type='character varying') THEN ALTER TABLE \"CompanyProfiles\" ALTER COLUMN \"SystemIntelligence\" TYPE text; END IF; END $$;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"DiscoveryConfidence\" integer;",
        "ALTER TABLE \"CompanyProfiles\" ADD COLUMN IF NOT EXISTS \"CreativeProfileConfirmedAt\" timestamp with time zone;",
        "ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"PasswordHash\" varchar(500) NOT NULL DEFAULT '';",
        "ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"EmailVerifiedAt\" timestamp with time zone;",
        "ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"InvitedAt\" timestamp with time zone;",
        "ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"InviteAcceptedAt\" timestamp with time zone;",
        @"CREATE TABLE IF NOT EXISTS ""TenantMediaAssets"" (
            ""Id"" uuid PRIMARY KEY,
            ""TenantId"" uuid NOT NULL,
            ""OfficeId"" uuid NULL REFERENCES ""Offices""(""Id"") ON DELETE SET NULL,
            ""AssetType"" varchar(80) NOT NULL,
            ""Url"" varchar(1000) NOT NULL DEFAULT '',
            ""StorageKey"" varchar(500) NOT NULL DEFAULT '',
            ""DisplayName"" varchar(200) NOT NULL DEFAULT '',
            ""Description"" varchar(1000) NOT NULL DEFAULT '',
            ""Tags"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""UsageContext"" varchar(300) NOT NULL DEFAULT '',
            ""IsApproved"" boolean NOT NULL DEFAULT true,
            ""Priority"" integer NOT NULL DEFAULT 0,
            ""IsDeleted"" boolean NOT NULL DEFAULT false,
            ""DeletedAt"" timestamp with time zone NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""CreatedBy"" uuid NOT NULL,
            ""UpdatedBy"" uuid NOT NULL
        );",
        @"CREATE TABLE IF NOT EXISTS ""OfficeBrandProfiles"" (
            ""Id"" uuid PRIMARY KEY,
            ""TenantId"" uuid NOT NULL,
            ""OfficeId"" uuid NOT NULL REFERENCES ""Offices""(""Id"") ON DELETE CASCADE,
            ""DisplayName"" varchar(200) NOT NULL DEFAULT '',
            ""Location"" varchar(200) NOT NULL DEFAULT '',
            ""LogoUrl"" varchar(1000) NOT NULL DEFAULT '',
            ""BrandColors"" varchar(500) NOT NULL DEFAULT '',
            ""AccentColors"" varchar(500) NOT NULL DEFAULT '',
            ""Contact"" varchar(200) NOT NULL DEFAULT '',
            ""WebsiteUrl"" varchar(500) NOT NULL DEFAULT '',
            ""ReservationUrl"" varchar(500) NOT NULL DEFAULT '',
            ""SocialTemplateStyle"" varchar(1000) NOT NULL DEFAULT '',
            ""DefaultCta"" varchar(80) NOT NULL DEFAULT '',
            ""Configuration"" jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            ""IsDeleted"" boolean NOT NULL DEFAULT false,
            ""DeletedAt"" timestamp with time zone NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""CreatedBy"" uuid NOT NULL,
            ""UpdatedBy"" uuid NOT NULL
        );",
        @"CREATE TABLE IF NOT EXISTS ""CanvaTemplateAssignments"" (
            ""Id"" uuid PRIMARY KEY,
            ""TenantId"" uuid NOT NULL,
            ""OfficeId"" uuid NULL REFERENCES ""Offices""(""Id"") ON DELETE SET NULL,
            ""CanvaTemplateId"" varchar(200) NOT NULL,
            ""Name"" varchar(200) NOT NULL,
            ""ContentKinds"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""UseCases"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""TemplateFamilyId"" varchar(120) NOT NULL DEFAULT '',
            ""AllowedIntents"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""AllowedChannels"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""RequiredAssetIntents"" jsonb NOT NULL DEFAULT '[]'::jsonb,
            ""RiskTier"" varchar(20) NOT NULL DEFAULT 'low',
            ""Status"" varchar(30) NOT NULL DEFAULT 'draft',
            ""ManualApprovalRequired"" boolean NOT NULL DEFAULT false,
            ""LastReviewedAt"" timestamp with time zone NULL,
            ""LastReviewedBy"" uuid NULL,
            ""AspectRatio"" varchar(20) NOT NULL DEFAULT 'freeform',
            ""DatasetContract"" jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            ""Enabled"" boolean NOT NULL DEFAULT true,
            ""Priority"" integer NOT NULL DEFAULT 0,
            ""BrandFitScore"" integer NOT NULL DEFAULT 0,
            ""Notes"" varchar(1000) NOT NULL DEFAULT '',
            ""IsDeleted"" boolean NOT NULL DEFAULT false,
            ""DeletedAt"" timestamp with time zone NULL,
            ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""UpdatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
            ""CreatedBy"" uuid NOT NULL,
            ""UpdatedBy"" uuid NOT NULL
        );",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"TemplateFamilyId\" varchar(120) NOT NULL DEFAULT '';",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"AllowedIntents\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"AllowedChannels\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"RequiredAssetIntents\" jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"RiskTier\" varchar(20) NOT NULL DEFAULT 'low';",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"Status\" varchar(30) NOT NULL DEFAULT 'draft';",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"ManualApprovalRequired\" boolean NOT NULL DEFAULT false;",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"LastReviewedAt\" timestamp with time zone;",
        "ALTER TABLE \"CanvaTemplateAssignments\" ADD COLUMN IF NOT EXISTS \"LastReviewedBy\" uuid;",
        "CREATE INDEX IF NOT EXISTS \"IX_TenantMediaAssets_TenantId_OfficeId_AssetType_Priority\" ON \"TenantMediaAssets\" (\"TenantId\", \"OfficeId\", \"AssetType\", \"Priority\");",
        "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_OfficeBrandProfiles_TenantId_OfficeId\" ON \"OfficeBrandProfiles\" (\"TenantId\", \"OfficeId\") WHERE \"IsDeleted\" = false;",
        "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_CanvaTemplateAssignments_TenantId_OfficeId_CanvaTemplateId\" ON \"CanvaTemplateAssignments\" (\"TenantId\", \"OfficeId\", \"CanvaTemplateId\") WHERE \"IsDeleted\" = false;",
        "CREATE INDEX IF NOT EXISTS \"IX_CanvaTemplateAssignments_TenantId_OfficeId_Enabled_Priority\" ON \"CanvaTemplateAssignments\" (\"TenantId\", \"OfficeId\", \"Enabled\", \"Priority\");",
        "CREATE INDEX IF NOT EXISTS \"IX_CanvaTemplateAssignments_TenantId_OfficeId_Status_RiskTier\" ON \"CanvaTemplateAssignments\" (\"TenantId\", \"OfficeId\", \"Status\", \"RiskTier\");",
    };

    foreach (var sql in patches)
        await ctx.Database.ExecuteSqlRawAsync(sql);
}

static async Task ApplyDataPatches(NexusDbContext ctx)
{
    var tenantId = new Guid("00000000-0000-0000-0000-000000000001");
    var officeId = new Guid("00000000-0000-0000-0000-000000000002");
    var userId = new Guid("00000000-0000-0000-0000-000000000001");

    var packagePricePatches = new[]
    {
        new { Slug = "starter", MonthlyPrice = 4900m, YearlyPrice = 49000m },
        new { Slug = "growth", MonthlyPrice = 9900m, YearlyPrice = 99000m },
        new { Slug = "performance", MonthlyPrice = 19900m, YearlyPrice = 199000m },
        new { Slug = "executive", MonthlyPrice = 39900m, YearlyPrice = 399000m }
    };

    foreach (var patch in packagePricePatches)
    {
        var package = await ctx.PackageDefinitions.FirstOrDefaultAsync(p => p.Slug == patch.Slug);
        if (package is null)
            continue;

        package.MonthlyPrice = patch.MonthlyPrice;
        package.YearlyPrice = patch.YearlyPrice;
        package.UpdatedBy = userId;
        package.UpdatedAt = DateTime.UtcNow;
    }

    await ctx.SaveChangesAsync();

    await PatchIncludeAgentInPackagesAsync(ctx, userId, "AnalyticsAnalyst", new[] { "performance", "executive" });
    await PatchIncludeAgentInPackagesAsync(ctx, userId, "ContentStrategy", new[] { "starter", "growth", "performance", "executive" });
    await ctx.SaveChangesAsync();

    var hasAnalyticsAgent = await ctx.Agents.AnyAsync(
        a => a.TenantId == tenantId && a.AgentType == AgentType.AnalyticsAnalyst);

    var analyticsZone = await ctx.OfficeZones.FirstOrDefaultAsync(
        z => z.OfficeId == officeId && z.ZoneType == OfficeZoneType.AnalyticsFloor);

    if (!hasAnalyticsAgent)
    {
        ctx.Agents.Add(new Agent
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneId = analyticsZone?.Id,
            AgentType = AgentType.AnalyticsAnalyst,
            Name = "Analytics Analyst",
            DisplayName = "The Insight Lens",
            AvatarUrl = "https://example.com/agents/analytics.png",
            Description = "Website traffic, search performance, and conversion analytics specialist",
            State = AgentState.Idle,
            IsEnabled = true,
            DeskPositionX = 150,
            DeskPositionY = 150,
            DeskPositionZ = 0,
            SystemPrompt = "You analyze GA4, Search Console, conversion, and visitor performance data.",
            CreatedBy = userId,
            UpdatedBy = userId
        });
    }

    var hasContentStrategyAgent = await ctx.Agents.AnyAsync(
        a => a.TenantId == tenantId && a.AgentType == AgentType.ContentStrategy);

    if (!hasContentStrategyAgent)
    {
        var contentZone = await ctx.OfficeZones.FirstOrDefaultAsync(
            z => z.OfficeId == officeId && z.ZoneType == OfficeZoneType.ContentStudio);

        ctx.Agents.Add(new Agent
        {
            TenantId = tenantId,
            OfficeId = officeId,
            ZoneId = contentZone?.Id,
            AgentType = AgentType.ContentStrategy,
            Name = "Content Strategy",
            DisplayName = "The Content Strategist",
            AvatarUrl = "https://example.com/agents/content-strategy.png",
            Description = "Weekly mission brief and content pillar planning",
            State = AgentState.Idle,
            IsEnabled = true,
            DeskPositionX = 110,
            DeskPositionY = 70,
            DeskPositionZ = 0,
            SystemPrompt = "You decide weekly content priorities and mission briefs before Gram Master creates content.",
            CreatedBy = userId,
            UpdatedBy = userId
        });
    }

    await ctx.SaveChangesAsync();
}

/// <summary>
/// Eski veritabanlarında paket JSON'unda yeni agent eksikse ekler (403 agent_not_in_package onarımı).
/// </summary>
static async Task PatchIncludeAgentInPackagesAsync(NexusDbContext ctx, Guid userId, string agentType, IEnumerable<string> slugs)
{
    foreach (var slug in slugs)
    {
        var package = await ctx.PackageDefinitions.FirstOrDefaultAsync(p => p.Slug == slug);
        if (package is null || string.IsNullOrWhiteSpace(package.IncludedAgentTypes))
            continue;
        if (package.IncludedAgentTypes.Contains(agentType, StringComparison.OrdinalIgnoreCase))
            continue;

        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(package.IncludedAgentTypes) ?? new List<string>();
            if (list.Exists(s => s.Equals(agentType, StringComparison.OrdinalIgnoreCase)))
                continue;
            list.Add(agentType);
            package.IncludedAgentTypes = JsonSerializer.Serialize(list);
            package.UpdatedBy = userId;
            package.UpdatedAt = DateTime.UtcNow;
        }
        catch
        {
            // Bozuk JSON — elle müdahale; sessiz geç
        }
    }
}
