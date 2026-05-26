using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IReviewService
{
    Task<ReviewDecisionDto> ApproveArtifactAsync(
        Guid artifactId,
        Guid userId,
        string comment,
        string? finalizedContent,
        CancellationToken cancellationToken = default);
    Task<ReviewDecisionDto> RejectArtifactAsync(Guid artifactId, Guid userId, string comment, CancellationToken cancellationToken = default);
    Task<ReviewDecisionDto> RequestRevisionAsync(Guid artifactId, Guid userId, string comment, CancellationToken cancellationToken = default);
}
