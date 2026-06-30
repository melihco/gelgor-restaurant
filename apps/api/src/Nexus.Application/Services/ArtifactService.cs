using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IArtifactService
{
    Task<List<ArtifactDto>> GetArtifactsAsync(
        Guid tenantId,
        Guid? agentRunId,
        int? limit = null,
        DateTime? sinceUtc = null,
        string? missionId = null,
        CancellationToken cancellationToken = default);
    Task<ArtifactDto?> GetArtifactByIdAsync(Guid artifactId, Guid tenantId, CancellationToken cancellationToken = default);
}
