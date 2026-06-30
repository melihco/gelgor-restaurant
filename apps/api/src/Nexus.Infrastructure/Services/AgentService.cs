using System.Text.Json;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Events;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Infrastructure.Services;

public class AgentService : IAgentService
{
    private readonly NexusDbContext _dbContext;
    private readonly ICrewOrchestrationService _crewOrchestrationService;
    private readonly IBrandLearningService _brandLearningService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IAgentRunProgressBroadcaster _agentRunProgress;

    private static readonly string[] CrewProgressHints =
    [
        "Python tarafında CrewAI ajanları planlama ve düşünme aşamasında.",
        "LLM bağlamı işleniyor; araç çağrıları sırayla yürütülüyor olabilir.",
        "Karmaşık görevlerde birkaç dakika sürebilir — bu süre model ve araçlara bağlıdır.",
        "Marka ve görev verisi modele iletildi; çıktı hazır olunca kayıt tamamlanacak.",
        "İşlem sürüyor; bu panel canlı güncellenir (kalp atışı + SignalR).",
    ];

    public AgentService(
        NexusDbContext dbContext,
        ICrewOrchestrationService crewOrchestrationService,
        IBrandLearningService brandLearningService,
        IServiceScopeFactory scopeFactory,
        IAgentRunProgressBroadcaster agentRunProgress)
    {
        _dbContext = dbContext;
        _crewOrchestrationService = crewOrchestrationService;
        _brandLearningService = brandLearningService;
        _scopeFactory = scopeFactory;
        _agentRunProgress = agentRunProgress;
    }

    public async Task<List<AgentDto>> GetAgentsByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Agents
            .Where(a => a.TenantId == tenantId)
            .OrderBy(a => a.Name)
            .Select(a => MapToDto(a))
            .ToListAsync(cancellationToken);
    }

    public async Task<List<AgentDto>> GetAgentsByOfficeAsync(Guid officeId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Agents
            .Where(a => a.OfficeId == officeId && a.TenantId == tenantId)
            .OrderBy(a => a.Name)
            .Select(a => MapToDto(a))
            .ToListAsync(cancellationToken);
    }

    public async Task<AgentType?> TryGetTenantAgentTypeAsync(Guid agentId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var row = await _dbContext.Agents.AsNoTracking()
            .Where(a => a.Id == agentId && a.TenantId == tenantId)
            .Select(a => new { a.AgentType })
            .FirstOrDefaultAsync(cancellationToken);
        return row?.AgentType;
    }

    public async Task<AgentDetailDto?> GetAgentDetailAsync(Guid agentId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var agent = await _dbContext.Agents
            .Include(a => a.Capabilities)
            .FirstOrDefaultAsync(a => a.Id == agentId && a.TenantId == tenantId, cancellationToken);

        if (agent == null)
            return null;

        var capabilities = agent.Capabilities
            .OrderBy(c => c.Priority)
            .Select(c => new AgentCapabilityDto(
                c.Id,
                c.Name,
                c.Description,
                c.Priority))
            .ToList();

        return new AgentDetailDto(
            agent.Id,
            agent.Name,
            agent.DisplayName,
            agent.AvatarUrl,
            agent.Description,
            agent.AgentType,
            agent.State,
            agent.IsEnabled,
            agent.CurrentTaskId,
            capabilities,
            agent.CreatedAt,
            agent.UpdatedAt);
    }

    public async Task<AgentDto> UpdateAgentStateAsync(Guid agentId, Guid tenantId, AgentState newState, CancellationToken cancellationToken = default)
    {
        var agent = await _dbContext.Agents
            .FirstOrDefaultAsync(a => a.Id == agentId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Agent not found");

        agent.State = newState;
        agent.UpdatedBy = SystemUserId;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(agent);
    }

    private static readonly Guid SystemUserId = new("00000000-0000-0000-0000-000000000001");

    /// <summary>
    /// Cancels the crew heartbeat and waits for it to exit. Capped so a stuck ExecuteUpdate/broadcast
    /// cannot block the API response after Python orchestration has already returned (UI would stay
    /// InProgress with a stale executionLog.elapsedSeconds).
    /// </summary>
    private static async Task StopCrewHeartbeatAsync(CancellationTokenSource heartbeatCts, Task heartbeatTask)
    {
        try
        {
            await heartbeatCts.CancelAsync();
        }
        catch
        {
            // ignore
        }

        try
        {
            await heartbeatTask.WaitAsync(TimeSpan.FromSeconds(20));
        }
        catch (OperationCanceledException)
        {
            // expected when heartbeat observes cancellation
        }
        catch (TimeoutException)
        {
            // heartbeat stuck — do not block the request indefinitely
        }
        catch
        {
            // heartbeat must not mask primary outcome
        }
    }

    public async Task<AgentExecutionDto> ExecuteAgentAsync(Guid agentId, Guid tenantId, ExecuteAgentRequest request, CancellationToken cancellationToken = default)
    {
        // Tenant-scoped load: never execute an agent that does not belong to the
        // caller's tenant (defense-in-depth against IDOR; the controller also
        // pre-checks but the service must not rely on that).
        var agent = await _dbContext.Agents
            .Include(a => a.Office)
            .FirstOrDefaultAsync(a => a.Id == agentId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Agent not found");

        var tenant = await _dbContext.Tenants
            .FirstOrDefaultAsync(t => t.Id == agent.TenantId, cancellationToken)
            ?? throw new NotFoundException("Tenant not found");

        var brandMemories = await _dbContext.BrandMemoryDocuments
            .Where(b => b.TenantId == agent.TenantId)
            .OrderByDescending(b => b.CreatedAt)
            .Take(12)
            .ToListAsync(cancellationToken);

        CompanyProfile? companyProfile = null;
        if (await TableExistsAsync("CompanyProfiles", cancellationToken))
        {
            companyProfile = await _dbContext.CompanyProfiles
                .FirstOrDefaultAsync(p => p.TenantId == agent.TenantId, cancellationToken);
        }
        var promptEnrichment = await _brandLearningService.BuildPromptEnrichmentAsync(
            agent.TenantId,
            cancellationToken);

        var resolvedTaskType = AgentTaskMapper.ResolveTaskType(agent.AgentType, request.TaskType);
        var inputJson = request.InputData?.GetRawText() ?? "{}";
        var now = DateTime.UtcNow;
        var estimatedDurationMinutes = AgentTaskMapper.EstimateTaskDurationMinutes(agent.AgentType, resolvedTaskType);

        var brief = new Brief
        {
            TenantId = agent.TenantId,
            CreatedByUserId = SystemUserId,
            Title = AgentTaskMapper.BuildBriefTitle(agent, request.InputData),
            Description = AgentTaskMapper.BuildTaskDescription(agent, resolvedTaskType),
            RawContent = inputJson,
            Status = BriefStatus.InProgress,
            SubmittedAt = now,
            CreatedBy = SystemUserId,
            UpdatedBy = SystemUserId
        };

        _dbContext.Briefs.Add(brief);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var task = new TaskItem
        {
            BriefId = brief.Id,
            TenantId = agent.TenantId,
            Title = AgentTaskMapper.BuildTaskTitle(agent, resolvedTaskType),
            Description = AgentTaskMapper.BuildTaskDescription(agent, resolvedTaskType),
            AgentType = agent.AgentType,
            Status = TaskStatus.InProgress,
            Priority = TaskPriority.High,
            EstimatedDurationMinutes = estimatedDurationMinutes,
            StartedAt = now,
            Input = inputJson,
            CreatedBy = SystemUserId,
            UpdatedBy = SystemUserId
        };

        _dbContext.TaskItems.Add(task);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var run = new AgentRun
        {
            TenantId = agent.TenantId,
            AgentId = agent.Id,
            TaskId = task.Id,
            StartedAt = now,
            Status = TaskStatus.InProgress,
            ProviderModel = "crewai",
            ExecutionLog = JsonSerializer.Serialize(new
            {
                stage = "delegated_to_crew_service",
                agentType = agent.AgentType.ToString(),
                taskType = resolvedTaskType
            }),
            CreatedBy = SystemUserId,
            UpdatedBy = SystemUserId
        };

        _dbContext.AgentRuns.Add(run);

        agent.State = AgentState.Working;
        agent.CurrentTaskId = task.Id;
        agent.UpdatedBy = SystemUserId;

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Once the run is persisted, keep the server-side execution independent from the HTTP
        // request lifetime. Browser/proxy timeouts must not leave paid CrewAI work stuck as InProgress.
        var executionToken = CancellationToken.None;
        using var heartbeatCts = new CancellationTokenSource();
        var heartbeatTask = RunCrewExecutionHeartbeatAsync(
            run.Id,
            agent.TenantId,
            agent.OfficeId,
            task.Id,
            task.Title,
            agent.AgentType,
            resolvedTaskType,
            run.StartedAt,
            heartbeatCts.Token);

        try
        {
            var orchestrationResponse = await _crewOrchestrationService.ExecuteAsync(
                new CrewExecutionRequest
                {
                    TenantId = agent.TenantId,
                    OfficeId = agent.OfficeId,
                    AgentRole = AgentTaskMapper.MapAgentRole(agent.AgentType),
                    TaskType = resolvedTaskType,
                    InputData = request.InputData,
                    CorrelationId = run.Id,
                    BrandContext = CrewBrandContextFactory.Build(
                        tenant,
                        agent.Office,
                        brandMemories,
                        companyProfile,
                        promptEnrichment)
                },
                executionToken);

            if (!string.Equals(orchestrationResponse.Status, "completed", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Crew orchestration returned status '{orchestrationResponse.Status}' for {agent.AgentType}/{resolvedTaskType}.");
            }

            // Python döndü; heartbeat ile SaveChanges aynı AgentRun satırında yarışmasın,
            // finally'de de kalp atışı sonsuza dek beklenmesin.
            await StopCrewHeartbeatAsync(heartbeatCts, heartbeatTask);

            var artifactType = AgentTaskMapper.MapArtifactType(agent.AgentType, orchestrationResponse.ArtifactType);
            var artifactContent = AgentTaskMapper.BuildArtifactContentFallback(
                orchestrationResponse.Content,
                agent,
                resolvedTaskType);

            var artifact = new OutputArtifact
            {
                TenantId = agent.TenantId,
                TaskId = task.Id,
                AgentRunId = run.Id,
                ArtifactType = artifactType,
                Title = string.IsNullOrWhiteSpace(orchestrationResponse.ArtifactTitle)
                    ? AgentTaskMapper.BuildTaskTitle(agent, resolvedTaskType)
                    : orchestrationResponse.ArtifactTitle,
                Content = artifactContent,
                Metadata = JsonSerializer.Serialize(orchestrationResponse.Metadata),
                ReviewStatus = ReviewStatus.Pending,
                CreatedBy = SystemUserId,
                UpdatedBy = SystemUserId
            };

            _dbContext.OutputArtifacts.Add(artifact);

            // ── SuggestedAction: action payload'u kaydet ────────────────
            // Python backend yapılandırılmış bir action_payload döndürdüyse,
            // bunu onay akışına giren bir SuggestedAction olarak kaydet.
            var suggestedActionCount = 0;
            if (orchestrationResponse.ActionPayload.HasValue &&
                orchestrationResponse.ActionPayload.Value.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                var ap = orchestrationResponse.ActionPayload.Value;
                var actionType = ap.TryGetProperty("action_type", out var at) ? at.GetString() ?? string.Empty : string.Empty;
                var providerStr = ap.TryGetProperty("provider", out var prov) ? prov.GetString() ?? "system" : "system";
                var crewApprovalRequired = !ap.TryGetProperty("approval_required", out var ar) || ar.GetBoolean();
                var payloadJson = ap.TryGetProperty("payload", out var pl)
                    ? pl.GetRawText()
                    : "{}";

                var integrationProvider = AgentTaskMapper.ResolveIntegrationProvider(providerStr, actionType);

                // Tenant'a bağlı uygun IntegrationConnection'ı bul (varsa)
                Guid? connectionId = null;
                if (integrationProvider.HasValue)
                {
                    var conn = await _dbContext.IntegrationConnections
                        .Where(c => c.TenantId == agent.TenantId && c.Provider == integrationProvider.Value)
                        .Select(c => c.Id)
                        .FirstOrDefaultAsync(executionToken);
                    if (conn != Guid.Empty) connectionId = conn;
                }

                var approvalRequired = AgentTaskMapper.ResolveApprovalRequired(crewApprovalRequired, companyProfile?.DefaultApprovalMode);
                if (integrationProvider.HasValue && !connectionId.HasValue)
                    approvalRequired = true;

                if (!string.IsNullOrEmpty(actionType) &&
                    actionType != "generic_output" &&
                    integrationProvider.HasValue)
                {
                    var suggestedAction = new SuggestedAction
                    {
                        TenantId = agent.TenantId,
                        ArtifactId = artifact.Id,
                        ActionType = actionType,
                        Provider = integrationProvider.Value,
                        IntegrationConnectionId = connectionId,
                        TargetRef = string.Empty,
                        Payload = payloadJson,
                        ApprovalRequired = approvalRequired,
                        Status = approvalRequired ? ActionStatus.Pending : ActionStatus.Approved,
                        CreatedBy = SystemUserId,
                        UpdatedBy = SystemUserId
                    };
                    _dbContext.SuggestedActions.Add(suggestedAction);
                    suggestedActionCount++;
                }
            }
            // ────────────────────────────────────────────────────────────

            brief.Status = BriefStatus.Completed;
            task.Status = TaskStatus.WaitingForApproval;
            task.Output = JsonSerializer.Serialize(new { result = artifactContent });
            task.CompletedAt = DateTime.UtcNow;
            run.Status = TaskStatus.Completed;
            run.CompletedAt = DateTime.UtcNow;
            run.TokensUsed = orchestrationResponse.TokensUsed < 0 ? 0 : orchestrationResponse.TokensUsed;
            run.ExecutionLog = JsonSerializer.Serialize(new
            {
                status = orchestrationResponse.Status,
                artifactType,
                artifactTitle = artifact.Title,
                contentLength = artifactContent.Length,
                suggestedActionCount,
                tokensUsed = run.TokensUsed,
                summary = orchestrationResponse.Summary,
                metadata = orchestrationResponse.Metadata
            });
            agent.State = AgentState.Idle;
            agent.CurrentTaskId = null;

            await _dbContext.SaveChangesAsync(executionToken);

            try
            {
                await _agentRunProgress.BroadcastAsync(
                    agent.TenantId,
                    agent.OfficeId,
                    new AgentRunProgressEvent
                    {
                        RunId = run.Id,
                        TaskId = task.Id,
                        TaskTitle = task.Title,
                        ExecutionLogJson = run.ExecutionLog,
                        At = run.CompletedAt ?? DateTime.UtcNow
                    },
                    executionToken);
            }
            catch
            {
                // Hub hatası tamamlanmış yürütmeyi geri almamalı; UI en geç bir sonraki özet poll’unda güncellenir.
            }

            return new AgentExecutionDto(
                task.Id,
                run.Id,
                artifact.Id,
                agent.TenantId,
                agent.OfficeId,
                agent.Id,
                agent.DisplayName,
                task.Title,
                artifact.Title,
                artifact.ArtifactType,
                task.Status,
                "Agent execution completed and review artifact created.");
        }
        catch (Exception ex)
        {
            brief.Status = BriefStatus.Failed;
            task.Status = TaskStatus.Failed;
            task.Output = "{}";
            task.ErrorMessage = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
            task.CompletedAt = DateTime.UtcNow;
            run.Status = TaskStatus.Failed;
            run.ErrorMessage = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
            run.CompletedAt = DateTime.UtcNow;
            run.ExecutionLog = JsonSerializer.Serialize(new
            {
                status = "failed",
                stage = "agent_execution",
                agentType = agent.AgentType.ToString(),
                taskType = resolvedTaskType,
                errorType = ex.GetType().Name,
                error = ex.Message,
                failedAt = DateTime.UtcNow
            });
            agent.State = AgentState.Error;
            agent.CurrentTaskId = null;

            await _dbContext.SaveChangesAsync(executionToken);

            try
            {
                await _agentRunProgress.BroadcastAsync(
                    agent.TenantId,
                    agent.OfficeId,
                    new AgentRunProgressEvent
                    {
                        RunId = run.Id,
                        TaskId = task.Id,
                        TaskTitle = task.Title,
                        ExecutionLogJson = run.ExecutionLog,
                        At = run.CompletedAt ?? DateTime.UtcNow
                    },
                    executionToken);
            }
            catch
            {
                // ignore hub failures on error path
            }

            throw;
        }
        finally
        {
            await StopCrewHeartbeatAsync(heartbeatCts, heartbeatTask);
        }
    }

    private async Task RunCrewExecutionHeartbeatAsync(
        Guid runId,
        Guid tenantId,
        Guid officeId,
        Guid taskId,
        string taskTitle,
        AgentType agentType,
        string taskType,
        DateTime runStartedAt,
        CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        const int rotationSeconds = 14;
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();

                var elapsed = (int)Math.Min(int.MaxValue / 2, (DateTime.UtcNow - runStartedAt).TotalSeconds);
                var crewActivity = CrewProgressHints[(elapsed / rotationSeconds) % CrewProgressHints.Length];
                var logJson = JsonSerializer.Serialize(new
                {
                    stage = "delegated_to_crew_service",
                    agentType = agentType.ToString(),
                    taskType,
                    heartbeatAt = DateTime.UtcNow,
                    elapsedSeconds = elapsed,
                    crewActivity
                });

                // Patch only ExecutionLog while Status is still InProgress. Loading the row and
                // SaveChanges would re-persist Status=InProgress from a stale tracker after the main
                // execution path has already saved Completed — leaving the UI stuck at "Crew servisi".
                var now = DateTime.UtcNow;
                var affected = await db.AgentRuns
                    .Where(r => r.Id == runId && r.Status == TaskStatus.InProgress)
                    .ExecuteUpdateAsync(
                        setters => setters
                            .SetProperty(r => r.ExecutionLog, logJson)
                            .SetProperty(r => r.UpdatedAt, now)
                            .SetProperty(r => r.UpdatedBy, SystemUserId),
                        cancellationToken);

                if (affected == 0)
                    break;

                await _agentRunProgress.BroadcastAsync(
                    tenantId,
                    officeId,
                    new AgentRunProgressEvent
                    {
                        RunId = runId,
                        TaskId = taskId,
                        TaskTitle = taskTitle,
                        ExecutionLogJson = logJson,
                        At = DateTime.UtcNow
                    },
                    cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                // hub veya DB geçici hatası — döngüye devam
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(4), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public async Task<CancelStuckExecutionResultDto> CancelStuckAgentExecutionAsync(
        Guid agentId,
        Guid tenantId,
        Guid? agentRunId,
        int minAgeMinutes,
        bool force,
        CancellationToken cancellationToken = default)
    {
        var agent = await _dbContext.Agents
            .FirstOrDefaultAsync(a => a.Id == agentId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Agent not found");

        var minAge = Math.Clamp(minAgeMinutes, 0, 24 * 60);

        AgentRun? run;
        if (agentRunId.HasValue)
        {
            run = await _dbContext.AgentRuns
                .Include(r => r.Task!)
                    .ThenInclude(t => t!.Brief)
                .FirstOrDefaultAsync(
                    r => r.Id == agentRunId.Value && r.TenantId == tenantId && r.AgentId == agentId,
                    cancellationToken);
        }
        else if (agent.CurrentTaskId.HasValue)
        {
            run = await _dbContext.AgentRuns
                .Include(r => r.Task!)
                    .ThenInclude(t => t!.Brief)
                .Where(r =>
                    r.TenantId == tenantId &&
                    r.AgentId == agentId &&
                    r.TaskId == agent.CurrentTaskId &&
                    r.Status == TaskStatus.InProgress)
                .OrderByDescending(r => r.StartedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }
        else
        {
            run = null;
        }

        if (run == null && !agentRunId.HasValue)
        {
            run = await _dbContext.AgentRuns
                .Include(r => r.Task!)
                    .ThenInclude(t => t!.Brief)
                .Where(r => r.TenantId == tenantId && r.AgentId == agentId && r.Status == TaskStatus.InProgress)
                .OrderByDescending(r => r.StartedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (run == null)
        {
            return new CancelStuckExecutionResultDto(
                false,
                "İptal edilecek devam eden çalıştırma bulunamadı.",
                null,
                null,
                agent.OfficeId,
                string.Empty);
        }

        if (run.Status != TaskStatus.InProgress)
        {
            return new CancelStuckExecutionResultDto(
                false,
                "Bu çalıştırma zaten tamamlanmış veya sonlandırılmış.",
                run.TaskId,
                run.Id,
                agent.OfficeId,
                run.Task?.Title ?? string.Empty);
        }

        if (!force && minAge > 0 && DateTime.UtcNow < run.StartedAt.AddMinutes(minAge))
        {
            throw new InvalidOperationException(
                $"Çalıştırma henüz {minAge} dakikadan uzun sürmedi. Hemen iptal etmek için force=true kullanın.");
        }

        var task = run.Task;
        var cancelNote =
            "Operatör tarafından uzun süren çalıştırma iptal edildi (yalnızca veritabanı durumu). Harici Crew süreci hâlâ çalışıyor olabilir.";
        var now = DateTime.UtcNow;

        run.Status = TaskStatus.Cancelled;
        run.CompletedAt = now;
        run.ErrorMessage = cancelNote.Length > 2000 ? cancelNote[..2000] : cancelNote;
        run.ExecutionLog = AppendCancellationToExecutionLog(run.ExecutionLog);
        run.UpdatedBy = SystemUserId;

        if (task != null)
        {
            task.Status = TaskStatus.Cancelled;
            task.CompletedAt = now;
            task.ErrorMessage = cancelNote.Length > 2000 ? cancelNote[..2000] : cancelNote;
            task.UpdatedBy = SystemUserId;
            if (task.Brief != null && task.Brief.Status == BriefStatus.InProgress)
            {
                task.Brief.Status = BriefStatus.Failed;
                task.Brief.UpdatedBy = SystemUserId;
            }
        }

        agent.State = AgentState.Idle;
        agent.CurrentTaskId = null;
        agent.UpdatedBy = SystemUserId;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new CancelStuckExecutionResultDto(
            true,
            "Çalıştırma ve görev iptal edildi; agent boşa alındı.",
            task?.Id ?? run.TaskId,
            run.Id,
            agent.OfficeId,
            task?.Title ?? string.Empty);
    }

    public async Task<WorkflowStartResponse> StartGrowthWorkflowAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var office = await _dbContext.Offices
            .FirstOrDefaultAsync(o => o.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Office not found");

        var agents = await _dbContext.Agents
            .Where(a => a.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        var requiredTypes = new[]
        {
            AgentType.AnalyticsAnalyst,
            AgentType.GoogleAdsAnalyst,
            AgentType.InstagramContentGenerator,
            AgentType.AiCeo
        };

        var missing = requiredTypes
            .Where(type => agents.All(agent => agent.AgentType != type))
            .ToArray();

        if (missing.Length > 0)
        {
            throw new InvalidOperationException($"Workflow cannot start. Missing agents: {string.Join(", ", missing)}");
        }

        var recentOutputs = await _dbContext.OutputArtifacts
            .Where(a => a.TenantId == tenantId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new
            {
                a.Title,
                a.ArtifactType,
                preview = a.Content.Length > 220 ? a.Content.Substring(0, 220) : a.Content,
                a.CreatedAt
            })
            .ToListAsync(cancellationToken);

        var activeActions = await _dbContext.SuggestedActions
            .Where(a => a.TenantId == tenantId && (a.Status == ActionStatus.Pending || a.Status == ActionStatus.Approved))
            .OrderByDescending(a => a.CreatedAt)
            .Take(10)
            .Select(a => new
            {
                a.ActionType,
                provider = a.Provider.ToString(),
                status = a.Status.ToString(),
                a.CreatedAt
            })
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var brief = new Brief
        {
            TenantId = tenantId,
            CreatedByUserId = SystemUserId,
            Title = "Growth Recovery Workflow",
            Description = "Analytics -> Ads -> Content -> CEO multi-agent workflow for detecting performance drops and turning them into coordinated actions.",
            RawContent = JsonSerializer.Serialize(new
            {
                workflow_type = "growth_recovery",
                goal = "Find performance drops, recommend campaign changes, generate supporting content, and summarize next decisions.",
                previous_outputs = recentOutputs,
                active_actions = activeActions
            }),
            Status = BriefStatus.Decomposed,
            SubmittedAt = now,
            DecomposedAt = now,
            CreatedBy = SystemUserId,
            UpdatedBy = SystemUserId
        };

        _dbContext.Briefs.Add(brief);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var sharedContext = new
        {
            workflow_id = brief.Id,
            workflow_type = "growth_recovery",
            brand_context_policy = "Use brand memory, previous outputs, active action queue, and current performance state before producing recommendations.",
            previous_outputs = recentOutputs,
            active_actions = activeActions
        };

        var taskSpecs = new List<WorkflowTaskSpec>
        {
            new(
                AgentType.AnalyticsAnalyst,
                "Growth Workflow 1/4 - Detect analytics drop",
                "Analyze traffic, conversion, SEO, and visitor behavior signals. Produce the key performance drop hypothesis.",
                TaskStatus.Pending,
                JsonSerializer.Serialize(new { taskType = "traffic_analysis", shared_context = sharedContext })),
            new(
                AgentType.GoogleAdsAnalyst,
                "Growth Workflow 2/4 - Recommend campaign response",
                "Use analytics findings and active campaign state to propose Google Ads budget and creative actions.",
                TaskStatus.WaitingForDependency,
                JsonSerializer.Serialize(new { taskType = "campaign_analysis", shared_context = sharedContext, depends_on = "analytics_findings" })),
            new(
                AgentType.InstagramContentGenerator,
                "Growth Workflow 3/4 - Generate supporting content",
                "Create content ideas that support the campaign response and organic recovery.",
                TaskStatus.WaitingForDependency,
                JsonSerializer.Serialize(new { taskType = "content_ideation", shared_context = sharedContext, depends_on = "ads_recommendations" })),
            new(
                AgentType.AiCeo,
                "Growth Workflow 4/4 - Executive decision summary",
                "Summarize analytics findings, ad recommendations, content plan, risks, and approval priorities.",
                TaskStatus.WaitingForDependency,
                JsonSerializer.Serialize(new { taskType = "campaign_analysis", shared_context = sharedContext, depends_on = "all_previous_steps" }))
        };

        var tasks = taskSpecs.Select(spec => new TaskItem
        {
            BriefId = brief.Id,
            TenantId = tenantId,
            Title = spec.Title,
            Description = spec.Description,
            AgentType = spec.AgentType,
            Status = spec.Status,
            Priority = TaskPriority.High,
            EstimatedDurationMinutes = 8,
            Input = spec.Input,
            CreatedBy = SystemUserId,
            UpdatedBy = SystemUserId
        }).ToList();

        await _dbContext.TaskItems.AddRangeAsync(tasks, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        for (var i = 1; i < tasks.Count; i++)
        {
            _dbContext.TaskDependencies.Add(new TaskDependency
            {
                TaskId = tasks[i].Id,
                DependsOnTaskId = tasks[i - 1].Id,
                IsSatisfied = false,
                CreatedBy = SystemUserId,
                UpdatedBy = SystemUserId
            });
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var steps = tasks.Select((task, index) => new WorkflowStepDto(
            task.Id,
            task.Title,
            task.AgentType,
            task.Status,
            index == 0 ? null : tasks[index - 1].Id)).ToList();

        return new WorkflowStartResponse(
            brief.Id,
            "growth_recovery",
            brief.Title,
            steps,
            "Growth recovery workflow created with Analytics -> Ads -> Content -> CEO dependencies.");
    }

    private static string AppendCancellationToExecutionLog(string existingLog)
    {
        object prior;
        try
        {
            prior = JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(existingLog) ? "{}" : existingLog);
        }
        catch
        {
            prior = existingLog ?? string.Empty;
        }

        return JsonSerializer.Serialize(new
        {
            cancelled = true,
            cancelledAt = DateTime.UtcNow,
            reason = "stuck_execution_cancelled_by_operator",
            note = "DB state only; external Crew worker may still be running until restarted.",
            prior
        });
    }

    private static AgentDto MapToDto(Agent agent)
    {
        return new AgentDto(
            agent.Id,
            agent.Name,
            agent.DisplayName,
            agent.AvatarUrl,
            agent.AgentType,
            agent.State,
            agent.IsEnabled,
            agent.CreatedAt,
            agent.UpdatedAt);
    }

    private async Task<bool> TableExistsAsync(string tableName, CancellationToken cancellationToken)
    {
        var connection = _dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT EXISTS (" +
            " SELECT 1" +
            " FROM information_schema.tables" +
            " WHERE table_schema = 'public'" +
            " AND table_name = @tableName" +
            ");";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "tableName";
        parameter.Value = tableName;
        command.Parameters.Add(parameter);

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool exists && exists;
    }

    private sealed record WorkflowTaskSpec(
        AgentType AgentType,
        string Title,
        string Description,
        TaskStatus Status,
        string Input);
}
