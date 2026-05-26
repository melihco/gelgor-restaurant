using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record BriefDto(
    Guid Id,
    string Title,
    string Description,
    BriefStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? SubmittedAt,
    DateTime? DecomposedAt,
    DateTime? CompletedAt);

public record CreateBriefRequest(
    string Title,
    string Description,
    string RawContent);

public record SubmitBriefRequest(
    Guid BriefId);
