using Nexus.Domain.Entities;

namespace Nexus.Application.Services;

public record VectorMemorySearchResult(
    Guid MemoryId,
    string DocumentType,
    string Title,
    string Content,
    double Score);

public record VectorMemoryStatus(
    bool Enabled,
    bool QdrantReachable,
    bool EmbeddingProviderConfigured,
    string Collection,
    string Message);

public interface IVectorMemoryService
{
    Task<bool> UpsertBrandMemoryAsync(
        BrandMemoryDocument memory,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VectorMemorySearchResult>> SearchBrandMemoryAsync(
        Guid tenantId,
        string query,
        int limit = 4,
        CancellationToken cancellationToken = default);

    Task<VectorMemoryStatus> GetStatusAsync(
        CancellationToken cancellationToken = default);
}
