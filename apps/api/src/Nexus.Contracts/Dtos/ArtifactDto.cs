using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record ArtifactDto(
    Guid Id,
    Guid TaskId,
    Guid? AgentRunId,
    ArtifactType ArtifactType,
    string Title,
    string Content,
    string Metadata,
    ReviewStatus ReviewStatus,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    /// <summary>
    /// CDN URL for video artifacts (Runway mp4) or image artifacts.
    /// Empty string if not applicable.
    /// </summary>
    string ContentUrl = "");
