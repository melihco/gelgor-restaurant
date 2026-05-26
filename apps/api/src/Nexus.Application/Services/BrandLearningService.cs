using Nexus.Domain.Entities;

namespace Nexus.Application.Services;

public record BrandMemoryReindexResult(
    Guid TenantId,
    int TotalDocuments,
    int EmbeddedDocuments,
    int SkippedDocuments,
    string Message);

public interface IBrandLearningService
{
    Task RecordApprovedArtifactAsync(
        OutputArtifact artifact,
        string comment,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task RecordRejectedArtifactAsync(
        OutputArtifact artifact,
        string comment,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task RecordExecutedActionAsync(
        SuggestedAction action,
        string executionSummary,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<string> BuildPromptEnrichmentAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default);

    Task<double> CalculateBrandStyleScoreAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default);

    Task<BrandMemoryReindexResult> ReindexBrandMemoryAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default);
}

