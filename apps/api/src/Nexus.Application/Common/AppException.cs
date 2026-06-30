namespace Nexus.Application.Common;

/// <summary>
/// Base type for application-level exceptions that map to deterministic HTTP
/// responses via the API's global exception handler. Throwing these instead of
/// raw <see cref="System.InvalidOperationException"/> keeps status-code mapping
/// out of controllers and avoids leaking 500s for expected failure modes.
/// </summary>
public abstract class AppException : Exception
{
    protected AppException(string message) : base(message)
    {
    }

    protected AppException(string message, Exception innerException) : base(message, innerException)
    {
    }
}

/// <summary>Requested resource does not exist or is not visible to the caller's tenant (HTTP 404).</summary>
public sealed class NotFoundException : AppException
{
    public NotFoundException(string message) : base(message)
    {
    }
}

/// <summary>Caller input failed business/domain validation (HTTP 400).</summary>
public sealed class ValidationException : AppException
{
    public ValidationException(string message) : base(message)
    {
    }

    public ValidationException(string message, IReadOnlyDictionary<string, string[]> errors) : base(message)
    {
        Errors = errors;
    }

    /// <summary>Optional per-field error details, surfaced as ProblemDetails extensions.</summary>
    public IReadOnlyDictionary<string, string[]>? Errors { get; }
}

/// <summary>Operation conflicts with current resource state (HTTP 409).</summary>
public sealed class ConflictException : AppException
{
    public ConflictException(string message) : base(message)
    {
    }
}
