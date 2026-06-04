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

    public async Task<List<ArtifactDto>> GetArtifactsAsync(
        Guid tenantId,
        Guid? agentRunId,
        int? limit = null,
        DateTime? sinceUtc = null,
        string? missionId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.OutputArtifacts
            .Where(a => a.TenantId == tenantId);

        if (agentRunId.HasValue)
        {
            query = query.Where(a => a.AgentRunId == agentRunId.Value);
        }

        if (sinceUtc.HasValue)
        {
            query = query.Where(a => a.CreatedAt >= sinceUtc.Value);
        }

        query = query.OrderByDescending(a => a.CreatedAt);

        if (!string.IsNullOrWhiteSpace(missionId))
        {
            var mid = missionId.Trim();
            // Metadata is stored as jsonb in PostgreSQL.
            // EF Core .Contains() translates to ~~ (LIKE) which jsonb does not support
            // (error 42883: operator does not exist: jsonb ~~ jsonb).
            // Solution: load tenant-scoped artifacts into memory, then filter with
            // string Contains — safe because the tenantId + limit bounds the result set.
            var take = limit is > 0 ? limit.Value * 4 : 400; // over-fetch then filter
            var candidates = await query
                .Take(take)
                .Select(a => MapToDto(a))
                .ToListAsync(cancellationToken);

            var matched = candidates
                .Where(a => a.Metadata != null && a.Metadata.Contains(mid))
                .ToList();

            return limit is > 0 ? matched.Take(limit.Value).ToList() : matched;
        }

        if (limit is > 0)
        {
            return await query
                .Take(limit.Value)
                .Select(a => MapToDto(a))
                .ToListAsync(cancellationToken);
        }

        return await query
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
