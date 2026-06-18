namespace Nexus.Application.Services;

/// <summary>
/// Ensures a Python/Crew workspace UUID exists as a Nexus tenant with default
/// user, office, and task — required before artifacts can be persisted.
/// </summary>
public interface IWorkspaceMirrorService
{
    Task<WorkspaceMirrorContext> EnsureAsync(Guid workspaceTenantId, CancellationToken cancellationToken = default);
}

public sealed record WorkspaceMirrorContext(Guid TenantId, Guid SystemUserId, Guid DefaultOfficeId, bool Created);
