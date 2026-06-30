using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Nexus.Api.Infrastructure;
using Nexus.Application.Common;

namespace Nexus.Application.Tests;

public class GlobalExceptionHandlerTests
{
    private sealed class CapturingProblemDetailsService : IProblemDetailsService
    {
        public ProblemDetailsContext? Captured { get; private set; }

        public ValueTask WriteAsync(ProblemDetailsContext context)
        {
            Captured = context;
            return ValueTask.CompletedTask;
        }

        public ValueTask<bool> TryWriteAsync(ProblemDetailsContext context)
        {
            Captured = context;
            return ValueTask.FromResult(true);
        }
    }

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public FakeHostEnvironment(string environmentName) => EnvironmentName = environmentName;
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "Nexus.Api";
        public string ContentRootPath { get; set; } = "/";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private static (CapturingProblemDetailsService Problem, DefaultHttpContext Http) Run(
        Exception exception,
        string environmentName = "Development",
        string? correlationId = "corr-123")
    {
        var problem = new CapturingProblemDetailsService();
        var handler = new GlobalExceptionHandler(
            problem,
            NullLogger<GlobalExceptionHandler>.Instance,
            new FakeHostEnvironment(environmentName));

        var http = new DefaultHttpContext();
        http.Request.Method = "POST";
        http.Request.Path = "/api/tasks/42";
        if (correlationId is not null)
            http.Items["CorrelationId"] = correlationId;

        var handled = handler.TryHandleAsync(http, exception, CancellationToken.None).AsTask().GetAwaiter().GetResult();
        Assert.True(handled);
        return (problem, http);
    }

    [Fact]
    public void NotFoundException_MapsTo404()
    {
        var (problem, http) = Run(new NotFoundException("Task not found"));

        Assert.Equal(StatusCodes.Status404NotFound, http.Response.StatusCode);
        Assert.Equal(StatusCodes.Status404NotFound, problem.Captured!.ProblemDetails.Status);
        Assert.Equal("Resource not found", problem.Captured.ProblemDetails.Title);
        Assert.Equal("Task not found", problem.Captured.ProblemDetails.Detail);
    }

    [Fact]
    public void ValidationException_MapsTo400_WithErrors()
    {
        var errors = new Dictionary<string, string[]> { ["name"] = new[] { "required" } };
        var (problem, http) = Run(new ValidationException("Invalid", errors));

        Assert.Equal(StatusCodes.Status400BadRequest, http.Response.StatusCode);
        Assert.Equal("Validation failed", problem.Captured!.ProblemDetails.Title);
        Assert.True(problem.Captured.ProblemDetails.Extensions.ContainsKey("errors"));
    }

    [Fact]
    public void ConflictException_MapsTo409()
    {
        var (problem, http) = Run(new ConflictException("Already exists"));

        Assert.Equal(StatusCodes.Status409Conflict, http.Response.StatusCode);
        Assert.Equal("Conflict", problem.Captured!.ProblemDetails.Title);
    }

    [Fact]
    public void ArgumentException_MapsTo400()
    {
        var (_, http) = Run(new ArgumentException("bad"));
        Assert.Equal(StatusCodes.Status400BadRequest, http.Response.StatusCode);
    }

    [Fact]
    public void UnauthorizedAccess_MapsTo403()
    {
        var (_, http) = Run(new UnauthorizedAccessException());
        Assert.Equal(StatusCodes.Status403Forbidden, http.Response.StatusCode);
    }

    [Fact]
    public void UnexpectedException_MapsTo500_AndMasksDetailOutsideDevelopment()
    {
        var (problem, http) = Run(new InvalidOperationException("internal secret"), environmentName: "Production");

        Assert.Equal(StatusCodes.Status500InternalServerError, http.Response.StatusCode);
        Assert.Equal("Internal server error", problem.Captured!.ProblemDetails.Title);
        Assert.DoesNotContain("secret", problem.Captured.ProblemDetails.Detail);
    }

    [Fact]
    public void UnexpectedException_InDevelopment_KeepsDetail()
    {
        var (problem, _) = Run(new InvalidOperationException("internal secret"), environmentName: "Development");
        Assert.Equal("internal secret", problem.Captured!.ProblemDetails.Detail);
    }

    [Fact]
    public void CorrelationId_IsPropagatedToProblemDetails()
    {
        var (problem, _) = Run(new NotFoundException("nope"), correlationId: "abc-999");

        Assert.True(problem.Captured!.ProblemDetails.Extensions.TryGetValue("correlationId", out var value));
        Assert.Equal("abc-999", value);
    }
}
