using Microsoft.EntityFrameworkCore;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class ArtifactService : IArtifactService
{
    private readonly NexusDbContext _dbContext;

    public ArtifactService(NexusDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<ArtifactDto>> GetArtifactsAsync(Guid tenantId, Guid? agentRunId, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.OutputArtifacts
            .Where(a => a.TenantId == tenantId);

        if (agentRunId.HasValue)
        {
            query = query.Where(a => a.AgentRunId == agentRunId.Value);
        }

        return await query
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => MapToDto(a))
            .ToListAsync(cancellationToken);
    }

    public async Task<ArtifactDto?> GetArtifactByIdAsync(Guid artifactId, CancellationToken cancellationToken = default)
    {
        var artifact = await _dbContext.OutputArtifacts
            .FirstOrDefaultAsync(a => a.Id == artifactId, cancellationToken);

        return artifact != null ? MapToDto(artifact) : null;
    }

    private static ArtifactDto MapToDto(OutputArtifact artifact)
    {
        return new ArtifactDto(
            artifact.Id,
            artifact.TaskId,
            artifact.AgentRunId,
            artifact.ArtifactType,
            artifact.Title,
            artifact.Content,
            artifact.Metadata,
            artifact.ReviewStatus,
            artifact.CreatedAt,
            artifact.UpdatedAt,
            artifact.ContentUrl);
    }
}
