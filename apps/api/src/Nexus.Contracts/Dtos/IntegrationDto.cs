using Nexus.Domain.Enums;

namespace Nexus.Contracts.Dtos;

public record IntegrationConnectionDto(
    Guid Id,
    IntegrationProvider Provider,
    string AccountId,
    string DisplayName,
    IntegrationStatus Status,
    string Scopes,
    DateTime? TokenExpiresAt,
    DateTime? LastHealthCheck,
    DateTime CreatedAt);

public record CreateIntegrationRequest(
    IntegrationProvider Provider,
    string AccountId,
    string DisplayName,
    string AccessToken,
    string RefreshToken,
    string Scopes);

public record UpdateIntegrationRequest(
    string? DisplayName,
    string? AccessToken,
    string? RefreshToken);

public record ProviderAccountMappingDto(
    Guid Id,
    Guid IntegrationConnectionId,
    string IntegrationDisplayName,
    AgentType AgentType,
    bool IsActive);

public record SetProviderMappingRequest(
    AgentType AgentType,
    Guid IntegrationConnectionId);
