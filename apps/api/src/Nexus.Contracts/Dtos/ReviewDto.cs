using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record ReviewDecisionDto(
    Guid Id,
    Guid ArtifactId,
    ReviewStatus Status,
    string Comment,
    DateTime CreatedAt);

public record ApproveArtifactRequest(
    Guid ArtifactId,
    string Comment = "",
    string? FinalizedContent = null);

public record RejectArtifactRequest(
    Guid ArtifactId,
    string Comment);

public record RequestRevisionRequest(
    Guid ArtifactId,
    string Comment);
