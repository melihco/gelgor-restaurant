using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record OfficeDto(
    Guid Id,
    string Name,
    string Description,
    bool IsDefault,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record OfficeDetailDto(
    Guid Id,
    string Name,
    string Description,
    bool IsDefault,
    List<OfficeZoneDto> Zones,
    List<AgentDto> Agents,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record OfficeZoneDto(
    Guid Id,
    OfficeZoneType ZoneType,
    string Name,
    decimal PositionX,
    decimal PositionY,
    decimal PositionZ,
    decimal Width,
    decimal Depth);
