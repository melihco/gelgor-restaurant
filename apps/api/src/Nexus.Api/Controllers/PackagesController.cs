using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PackagesController : ControllerBase
{
    private readonly IPackageService _packageService;
    private readonly IUsageQuotaService _usageQuotaService;
    private readonly IRequestContext _requestContext;

    public PackagesController(
        IPackageService packageService,
        IUsageQuotaService usageQuotaService,
        IRequestContext requestContext)
    {
        _packageService = packageService;
        _usageQuotaService = usageQuotaService;
        _requestContext = requestContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<PackageDefinitionDto>>> GetPackages(CancellationToken cancellationToken)
    {
        var packages = await _packageService.GetPackagesAsync(cancellationToken);
        return Ok(packages);
    }

    [HttpGet("subscription")]
    public async Task<ActionResult<TenantSubscriptionDto>> GetSubscription(CancellationToken cancellationToken)
    {
        var subscription = await _packageService.GetSubscriptionAsync(_requestContext.TenantId, cancellationToken);
        if (subscription == null)
            return NotFound();
        return Ok(subscription);
    }

    [HttpGet("usage")]
    public async Task<ActionResult<UsageQuotaSummaryDto>> GetUsage(CancellationToken cancellationToken)
    {
        var usage = await _usageQuotaService.GetUsageSummaryAsync(_requestContext.TenantId, cancellationToken);
        return Ok(usage);
    }

    [HttpGet("entitlements/{feature}")]
    public async Task<ActionResult> CheckEntitlement(string feature, CancellationToken cancellationToken)
    {
        var usage = await _usageQuotaService.GetUsageSummaryAsync(_requestContext.TenantId, cancellationToken);
        var normalized = feature.Trim().ToLowerInvariant();
        var hasActiveSubscription = usage.Status is "Trial" or "Active";
        var allowed = normalized switch
        {
            "agent_run" => hasActiveSubscription && (usage.AgentRuns.IsUnlimited || usage.AgentRuns.Remaining > 0),
            "provider_action" => hasActiveSubscription && (usage.ProviderActions.IsUnlimited || usage.ProviderActions.Remaining > 0),
            "live_provider_action" => hasActiveSubscription && (usage.LiveProviderActions.IsUnlimited || usage.LiveProviderActions.Remaining > 0),
            "canva_export" => hasActiveSubscription && usage.PackageSlug != "none",
            "customer_report" => hasActiveSubscription &&
                usage.PackageSlug is "starter" or "growth" or "performance" or "executive",
            _ => false
        };

        return Ok(new
        {
            feature = normalized,
            allowed,
            package = usage.PackageSlug,
            subscriptionStatus = usage.Status,
            reason = allowed ? "allowed" : "entitlement_required"
        });
    }

    [HttpPost("subscribe")]
    public async Task<ActionResult<TenantSubscriptionDto>> Subscribe([FromBody] SelectPackageRequest request, CancellationToken cancellationToken)
    {
        var subscription = await _packageService.SelectPackageAsync(_requestContext.TenantId, request, cancellationToken);
        return Ok(subscription);
    }
}
