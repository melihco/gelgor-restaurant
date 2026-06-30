using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReviewsController : ControllerBase
{
    private readonly IReviewService _reviewService;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;

    public ReviewsController(
        IReviewService reviewService,
        IRequestContext requestContext,
        IPermissionService permissionService)
    {
        _reviewService = reviewService;
        _requestContext = requestContext;
        _permissionService = permissionService;
    }

    [HttpPost("approve")]
    public async Task<ActionResult<ReviewDecisionDto>> ApproveArtifact(ApproveArtifactRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        var decision = await _reviewService.ApproveArtifactAsync(
            request.ArtifactId,
            _requestContext.TenantId,
            _requestContext.UserId,
            request.Comment,
            request.FinalizedContent,
            cancellationToken);
        return Ok(decision);
    }

    [HttpPost("reject")]
    public async Task<ActionResult<ReviewDecisionDto>> RejectArtifact(RejectArtifactRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        var decision = await _reviewService.RejectArtifactAsync(request.ArtifactId, _requestContext.TenantId, _requestContext.UserId, request.Comment, cancellationToken);
        return Ok(decision);
    }

    [HttpPost("request-revision")]
    public async Task<ActionResult<ReviewDecisionDto>> RequestRevision(RequestRevisionRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.ArtifactsReview, cancellationToken))
            return Forbid();

        var decision = await _reviewService.RequestRevisionAsync(request.ArtifactId, _requestContext.TenantId, _requestContext.UserId, request.Comment, cancellationToken);
        return Ok(decision);
    }
}
