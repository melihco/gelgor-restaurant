using System.Reflection;
using System.Text.Json;
using Nexus.Application.Services;

namespace Nexus.Application.Tests;

/// <summary>
/// Drift guard: the .NET orchestration contract types must stay in sync with the
/// shared SSOT manifest (contracts/internal-agent-contract.json). The Python side
/// has a mirror test. Field names are compared in wire format (snake_case), the
/// same policy CrewOrchestrationService uses to serialize requests.
/// </summary>
public class InternalContractParityTests
{
    private static readonly JsonNamingPolicy Naming = JsonNamingPolicy.SnakeCaseLower;

    private static JsonElement Manifest()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "contracts", "internal-agent-contract.json");
            if (File.Exists(candidate))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(candidate));
                return doc.RootElement.Clone();
            }
            dir = dir.Parent;
        }

        throw new FileNotFoundException(
            "Could not locate contracts/internal-agent-contract.json by walking up from " +
            AppContext.BaseDirectory);
    }

    private static HashSet<string> ManifestFields(string model, string key = "fields")
    {
        var arr = Manifest().GetProperty("models").GetProperty(model).GetProperty(key);
        return arr.EnumerateArray().Select(e => e.GetString()!).ToHashSet();
    }

    private static HashSet<string> WireFields(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => Naming.ConvertName(p.Name))
            .ToHashSet();

    [Fact]
    public void CrewBrandContext_Matches_DotnetForwardedFields()
    {
        var expected = ManifestFields("InternalBrandContext", "dotnetForwards");
        var actual = WireFields(typeof(CrewBrandContext));

        Assert.True(
            expected.SetEquals(actual),
            $"CrewBrandContext drift. Missing: [{string.Join(", ", expected.Except(actual))}], " +
            $"Unexpected: [{string.Join(", ", actual.Except(expected))}]. " +
            "Update contracts/internal-agent-contract.json (dotnetForwards) and Python's InternalBrandContext.");
    }

    [Fact]
    public void CrewBrandContext_ForwardsOnlyKnownPythonFields()
    {
        var known = ManifestFields("InternalBrandContext");
        var actual = WireFields(typeof(CrewBrandContext));
        var unknown = actual.Except(known).ToList();

        Assert.True(
            unknown.Count == 0,
            $"CrewBrandContext sends fields Python does not define (silently dropped): [{string.Join(", ", unknown)}]");
    }

    [Fact]
    public void CrewExecutionRequest_Matches_Manifest()
    {
        var expected = ManifestFields("InternalAgentExecutionRequest");
        var actual = WireFields(typeof(CrewExecutionRequest));

        Assert.True(
            expected.SetEquals(actual),
            $"CrewExecutionRequest drift. Missing: [{string.Join(", ", expected.Except(actual))}], " +
            $"Unexpected: [{string.Join(", ", actual.Except(expected))}].");
    }

    [Fact]
    public void CrewExecutionResponse_Matches_Manifest()
    {
        var expected = ManifestFields("InternalAgentExecutionResponse");
        var actual = WireFields(typeof(CrewExecutionResponse));

        Assert.True(
            expected.SetEquals(actual),
            $"CrewExecutionResponse drift. Missing: [{string.Join(", ", expected.Except(actual))}], " +
            $"Unexpected: [{string.Join(", ", actual.Except(expected))}].");
    }
}
