using Nexus.Domain.Entities;

namespace Nexus.Application.Services;

public record ActionProviderExecutionResult(
    bool Success,
    string Message,
    object ProviderResponse,
    object ResultData,
    string Mode);

public interface IActionProviderExecutor
{
    Task<ActionProviderExecutionResult> ExecuteAsync(
        SuggestedAction action,
        string mode,
        CancellationToken cancellationToken = default);
}
