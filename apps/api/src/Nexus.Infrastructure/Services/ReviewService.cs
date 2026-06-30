using Microsoft.EntityFrameworkCore;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class ReviewService : IReviewService
{
    private readonly NexusDbContext _dbContext;
    private readonly IBrandLearningService _brandLearningService;

    public ReviewService(NexusDbContext dbContext, IBrandLearningService brandLearningService)
    {
        _dbContext = dbContext;
        _brandLearningService = brandLearningService;
    }

    public async Task<ReviewDecisionDto> ApproveArtifactAsync(
        Guid artifactId,
        Guid tenantId,
        Guid userId,
        string comment,
        string? finalizedContent,
        CancellationToken cancellationToken = default)
    {
        var artifact = await _dbContext.OutputArtifacts
            .FirstOrDefaultAsync(a => a.Id == artifactId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Artifact not found");

        if (!string.IsNullOrWhiteSpace(finalizedContent))
        {
            artifact.Content = finalizedContent.Trim();
            artifact.UpdatedBy = userId;
        }

        artifact.ReviewStatus = ReviewStatus.Approved;

        var decision = new ReviewDecision
        {
            ArtifactId = artifactId,
            TaskId = artifact.TaskId,
            ReviewedByUserId = userId,
            Status = ReviewStatus.Approved,
            Comment = comment,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        _dbContext.ReviewDecisions.Add(decision);
        await _brandLearningService.RecordApprovedArtifactAsync(artifact, comment, userId, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(decision);
    }

    public async Task<ReviewDecisionDto> RejectArtifactAsync(Guid artifactId, Guid tenantId, Guid userId, string comment, CancellationToken cancellationToken = default)
    {
        var artifact = await _dbContext.OutputArtifacts
            .FirstOrDefaultAsync(a => a.Id == artifactId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Artifact not found");

        artifact.ReviewStatus = ReviewStatus.Rejected;

        var decision = new ReviewDecision
        {
            ArtifactId = artifactId,
            TaskId = artifact.TaskId,
            ReviewedByUserId = userId,
            Status = ReviewStatus.Rejected,
            Comment = comment,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        _dbContext.ReviewDecisions.Add(decision);
        await _brandLearningService.RecordRejectedArtifactAsync(artifact, comment, userId, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(decision);
    }

    public async Task<ReviewDecisionDto> RequestRevisionAsync(Guid artifactId, Guid tenantId, Guid userId, string comment, CancellationToken cancellationToken = default)
    {
        var artifact = await _dbContext.OutputArtifacts
            .FirstOrDefaultAsync(a => a.Id == artifactId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Artifact not found");

        artifact.ReviewStatus = ReviewStatus.RevisionRequested;

        var decision = new ReviewDecision
        {
            ArtifactId = artifactId,
            TaskId = artifact.TaskId,
            ReviewedByUserId = userId,
            Status = ReviewStatus.RevisionRequested,
            Comment = comment,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        _dbContext.ReviewDecisions.Add(decision);
        await _brandLearningService.RecordRejectedArtifactAsync(
            artifact,
            string.IsNullOrWhiteSpace(comment) ? "Revision requested by reviewer." : comment,
            userId,
            cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(decision);
    }

    private static ReviewDecisionDto MapToDto(ReviewDecision decision)
    {
        return new ReviewDecisionDto(
            decision.Id,
            decision.ArtifactId,
            decision.Status,
            decision.Comment,
            decision.CreatedAt);
    }
}
