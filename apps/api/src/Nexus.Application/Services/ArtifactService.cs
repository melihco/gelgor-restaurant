using Nexus.Contracts.Dtos;

namespace Nexus.Application.Services;

public interface IArtifactService
{
    Task<List<ArtifactDto>> GetArtifactsAsync(Guid tenantId, Guid? agentRunId, CancellationToken cancellationToken = default);
    Task<ArtifactDto?> GetArtifactByIdAsync(Guid artifactId, CancellationToken cancellationToken = default);
}
