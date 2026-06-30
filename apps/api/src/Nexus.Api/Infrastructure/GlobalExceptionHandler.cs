using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Common;

namespace Nexus.Api.Infrastructure;

/// <summary>
/// Centralizes exception-to-HTTP mapping so controllers/services can throw
/// domain exceptions (<see cref="AppException"/>) without knowing about status
/// codes. Produces RFC 7807 ProblemDetails responses and echoes the request
/// correlation id. Unexpected exceptions are logged at Error and return a
/// generic 500 (no internal detail leaked in non-development environments).
/// </summary>
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IHostEnvironment _environment;

    public GlobalExceptionHandler(
        IProblemDetailsService problemDetailsService,
        ILogger<GlobalExceptionHandler> logger,
        IHostEnvironment environment)
    {
        _problemDetailsService = problemDetailsService;
        _logger = logger;
        _environment = environment;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = Map(exception);
        var correlationId = httpContext.Items.TryGetValue("CorrelationId", out var value)
            ? value as string
            : null;

        if (statusCode >= StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(
                exception,
                "Unhandled exception ({CorrelationId}) on {Method} {Path}",
                correlationId,
                httpContext.Request.Method,
                httpContext.Request.Path);
        }
        else
        {
            _logger.LogWarning(
                "Handled {ExceptionType} -> {StatusCode} ({CorrelationId}) on {Method} {Path}: {Message}",
                exception.GetType().Name,
                statusCode,
                correlationId,
                httpContext.Request.Method,
                httpContext.Request.Path,
                exception.Message);
        }

        httpContext.Response.StatusCode = statusCode;

        var detail = statusCode >= StatusCodes.Status500InternalServerError && !_environment.IsDevelopment()
            ? "An unexpected error occurred while processing the request."
            : exception.Message;

        var problemDetails = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path,
        };

        if (!string.IsNullOrWhiteSpace(correlationId))
            problemDetails.Extensions["correlationId"] = correlationId;

        if (exception is ValidationException { Errors: { Count: > 0 } errors })
            problemDetails.Extensions["errors"] = errors;

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problemDetails,
            Exception = exception,
        });
    }

    private static (int StatusCode, string Title) Map(Exception exception) => exception switch
    {
        NotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
        ValidationException => (StatusCodes.Status400BadRequest, "Validation failed"),
        ConflictException => (StatusCodes.Status409Conflict, "Conflict"),
        KeyNotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
        ArgumentException => (StatusCodes.Status400BadRequest, "Invalid argument"),
        UnauthorizedAccessException => (StatusCodes.Status403Forbidden, "Forbidden"),
        _ => (StatusCodes.Status500InternalServerError, "Internal server error"),
    };
}
