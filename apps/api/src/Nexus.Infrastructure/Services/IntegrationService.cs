using Microsoft.EntityFrameworkCore;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;

namespace Nexus.Infrastructure.Services;

public class IntegrationService : IIntegrationService
{
    private readonly NexusDbContext _context;

    public IntegrationService(NexusDbContext context)
    {
        _context = context;
    }

    public async Task<List<IntegrationConnectionDto>> GetConnectionsAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.IntegrationConnections
            .Where(c => c.TenantId == tenantId)
            .OrderBy(c => c.Provider)
            .Select(c => new IntegrationConnectionDto(
                c.Id,
                c.Provider,
                c.AccountId,
                c.DisplayName,
                c.Status,
                c.Scopes,
                c.TokenExpiresAt,
                c.LastHealthCheck,
                c.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<IntegrationConnectionDto> CreateConnectionAsync(Guid tenantId, CreateIntegrationRequest request, CancellationToken cancellationToken = default)
    {
        var connection = new IntegrationConnection
        {
            TenantId = tenantId,
            Provider = request.Provider,
            AccountId = request.AccountId,
            DisplayName = request.DisplayName,
            Status = IntegrationStatus.Connected,
            Scopes = request.Scopes,
            EncryptedAccessToken = request.AccessToken,
            EncryptedRefreshToken = request.RefreshToken,
            TokenExpiresAt = DateTime.UtcNow.AddDays(60),
            LastHealthCheck = DateTime.UtcNow,
        };

        _context.IntegrationConnections.Add(connection);
        await _context.SaveChangesAsync(cancellationToken);

        return new IntegrationConnectionDto(
            connection.Id,
            connection.Provider,
            connection.AccountId,
            connection.DisplayName,
            connection.Status,
            connection.Scopes,
            connection.TokenExpiresAt,
            connection.LastHealthCheck,
            connection.CreatedAt);
    }

    public async Task<IntegrationConnectionDto> UpdateConnectionAsync(Guid connectionId, Guid tenantId, UpdateIntegrationRequest request, CancellationToken cancellationToken = default)
    {
        var connection = await _context.IntegrationConnections
            .FirstOrDefaultAsync(c => c.Id == connectionId && c.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Connection not found");

        if (request.DisplayName != null) connection.DisplayName = request.DisplayName;
        if (request.AccessToken != null)
        {
            connection.EncryptedAccessToken = request.AccessToken;
            connection.Status = IntegrationStatus.Connected;
            connection.TokenExpiresAt = DateTime.UtcNow.AddDays(60);
        }
        if (request.RefreshToken != null) connection.EncryptedRefreshToken = request.RefreshToken;
        connection.LastHealthCheck = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);

        return new IntegrationConnectionDto(
            connection.Id,
            connection.Provider,
            connection.AccountId,
            connection.DisplayName,
            connection.Status,
            connection.Scopes,
            connection.TokenExpiresAt,
            connection.LastHealthCheck,
            connection.CreatedAt);
    }

    public async Task DeleteConnectionAsync(Guid connectionId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var connection = await _context.IntegrationConnections
            .FirstOrDefaultAsync(c => c.Id == connectionId && c.TenantId == tenantId, cancellationToken);
        if (connection != null)
        {
            _context.IntegrationConnections.Remove(connection);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<List<ProviderAccountMappingDto>> GetMappingsAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _context.ProviderAccountMappings
            .Include(m => m.IntegrationConnection)
            .Where(m => m.TenantId == tenantId)
            .Select(m => new ProviderAccountMappingDto(
                m.Id,
                m.IntegrationConnectionId,
                m.IntegrationConnection!.DisplayName,
                m.AgentType,
                m.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<ProviderAccountMappingDto> SetMappingAsync(Guid tenantId, SetProviderMappingRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await _context.ProviderAccountMappings
            .FirstOrDefaultAsync(m => m.TenantId == tenantId && m.AgentType == request.AgentType, cancellationToken);

        if (existing != null)
        {
            existing.IntegrationConnectionId = request.IntegrationConnectionId;
            existing.IsActive = true;
        }
        else
        {
            existing = new ProviderAccountMapping
            {
                TenantId = tenantId,
                IntegrationConnectionId = request.IntegrationConnectionId,
                AgentType = request.AgentType,
                IsActive = true,
            };
            _context.ProviderAccountMappings.Add(existing);
        }

        await _context.SaveChangesAsync(cancellationToken);

        var connection = await _context.IntegrationConnections
            .FirstAsync(c => c.Id == existing.IntegrationConnectionId, cancellationToken);

        return new ProviderAccountMappingDto(
            existing.Id,
            existing.IntegrationConnectionId,
            connection.DisplayName,
            existing.AgentType,
            existing.IsActive);
    }
}
