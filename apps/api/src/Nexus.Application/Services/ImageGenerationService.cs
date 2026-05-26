namespace Nexus.Application.Services;

public interface IImageGenerationService
{
    /// <summary>
    /// Generates an image for a given prompt and returns a displayable data URL.
    /// Returns null when generation is unavailable or fails.
    /// </summary>
    Task<string?> GenerateImageDataUrlAsync(string prompt, CancellationToken cancellationToken = default);
}

