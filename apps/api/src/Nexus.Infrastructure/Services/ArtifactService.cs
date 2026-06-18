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
        if (!string.IsNullOrWhiteSpace(missionId))
        {
            var mid = missionId.Trim();
            var filteredQuery = _dbContext.OutputArtifacts
                .FromSqlInterpolated($@"
                    SELECT *
            FROM ""OutputArtifacts""
            WHERE ""TenantId"" = {tenantId}
              AND (
                ""Metadata""->>'mission_id' = {mid}
                OR ""Metadata""->>'missionId' = {mid}
                OR (""Content""::jsonb->>'mission_id') = {mid}
                OR (""Content""::jsonb->>'missionId') = {mid}
              )
                ")
                .AsNoTracking();

            if (agentRunId.HasValue)
            {
                filteredQuery = filteredQuery.Where(a => a.AgentRunId == agentRunId.Value);
            }

            if (sinceUtc.HasValue)
            {
                filteredQuery = filteredQuery.Where(a => a.CreatedAt >= sinceUtc.Value);
            }

            filteredQuery = filteredQuery.OrderByDescending(a => a.CreatedAt);

            if (limit is > 0)
            {
                filteredQuery = filteredQuery.Take(limit.Value);
            }

            return await filteredQuery
                .Select(a => MapToDto(a))
                .ToListAsync(cancellationToken);
        }

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
