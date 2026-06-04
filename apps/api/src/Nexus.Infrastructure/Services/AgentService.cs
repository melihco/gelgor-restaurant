using System.Text.Json;
using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
            ?? throw new InvalidOperationException("Agent not found");

        agent.State = newState;
        agent.UpdatedBy = SystemUserId;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(agent);
    }

    private static readonly Guid SystemUserId = new("00000000-0000-0000-0000-000000000001");

    private static bool ResolveApprovalRequired(bool crewApprovalRequired, ApprovalMode? defaultApprovalMode)
    {
        return defaultApprovalMode switch
        {
            ApprovalMode.AutoExecute => false,
            ApprovalMode.SuggestOnly or ApprovalMode.SuggestAndWait => true,
            _ => crewApprovalRequired
        };
    }

    private static IntegrationProvider? ResolveIntegrationProvider(string provider, string actionType)
    {
        var normalizedProvider = provider.Trim().ToLowerInvariant();
        var normalizedAction = actionType.Trim().ToLowerInvariant();

        return normalizedProvider switch
        {
            "google_business" => IntegrationProvider.GoogleBusiness,
            "instagram" => IntegrationProvider.Instagram,
            "google_ads" => IntegrationProvider.GoogleAds,
            "google_analytics" or "analytics" => IntegrationProvider.GoogleAnalytics,
            "search_console" => IntegrationProvider.SearchConsole,
            "system" => ResolveSystemActionProvider(normalizedAction),
            _ => ResolveSystemActionProvider(normalizedAction)
        };
    }

    private static IntegrationProvider? ResolveSystemActionProvider(string actionType)
    {
        return actionType switch
        {
            "reply_to_google_review" => IntegrationProvider.GoogleBusiness,
            "create_instagram_content_plan" or "schedule_instagram_posts" or "create_weekly_content_strategy" => IntegrationProvider.Instagram,
            "apply_campaign_recommendations" or "create_ad_creatives" or "apply_budget_optimization" => IntegrationProvider.GoogleAds,
            "log_analytics_report" => IntegrationProvider.GoogleAnalytics,
            _ => null
        };
    }

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

    public async Task<AgentExecutionDto> ExecuteAgentAsync(Guid agentId, ExecuteAgentRequest request, CancellationToken cancellationToken = default)
    {
        var agent = await _dbContext.Agents
            .Include(a => a.Office)
            .FirstOrDefaultAsync(a => a.Id == agentId, cancellationToken)
            ?? throw new InvalidOperationException("Agent not found");

        var tenant = await _dbContext.Tenants
            .FirstOrDefaultAsync(t => t.Id == agent.TenantId, cancellationToken)
            ?? throw new InvalidOperationException("Tenant not found");

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

        var resolvedTaskType = ResolveTaskType(agent.AgentType, request.TaskType);
        var inputJson = request.InputData?.GetRawText() ?? "{}";
        var now = DateTime.UtcNow;
        var estimatedDurationMinutes = EstimateTaskDurationMinutes(agent.AgentType, resolvedTaskType);

        var brief = new Brief
        {
            TenantId = agent.TenantId,
            CreatedByUserId = SystemUserId,
            Title = BuildBriefTitle(agent, request.InputData),
            Description = BuildTaskDescription(agent, resolvedTaskType),
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
            Title = BuildTaskTitle(agent, resolvedTaskType),
            Description = BuildTaskDescription(agent, resolvedTaskType),
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
                    AgentRole = MapAgentRole(agent.AgentType),
                    TaskType = resolvedTaskType,
                    InputData = request.InputData,
                    CorrelationId = run.Id,
                    BrandContext = BuildBrandContext(
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

            var artifactType = MapArtifactType(agent.AgentType, orchestrationResponse.ArtifactType);
            var artifactContent = BuildArtifactContentFallback(
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
                    ? BuildTaskTitle(agent, resolvedTaskType)
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

                var integrationProvider = ResolveIntegrationProvider(providerStr, actionType);

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

                var approvalRequired = ResolveApprovalRequired(crewApprovalRequired, companyProfile?.DefaultApprovalMode);
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
            ?? throw new InvalidOperationException("Agent not found");

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
            ?? throw new InvalidOperationException("Office not found");

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

    private static string MapAgentRole(AgentType agentType)
    {
        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => "review_agent",
            AgentType.ContentStrategy => "content_strategy_agent",
            AgentType.BlogWriter or AgentType.SocialMediaDesigner or AgentType.InstagramContentGenerator
                or AgentType.SeoSpecialist or AgentType.UiUxDesigner or AgentType.VideoEditor => "content_agent",
            AgentType.AnalyticsAnalyst => "analytics_agent",
            AgentType.GoogleAdsAnalyst or AgentType.AiStrategist or AgentType.AiCeo => "ads_agent",
            _ => throw new InvalidOperationException($"Agent type '{agentType}' is not mapped to a CrewAI role yet.")
        };
    }

    private static string ResolveTaskType(AgentType agentType, string? requestedTaskType)
    {
        if (!string.IsNullOrWhiteSpace(requestedTaskType))
        {
            return requestedTaskType;
        }

        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => "single_review_response",
            AgentType.ContentStrategy => "content_strategy",
            AgentType.BlogWriter or AgentType.SocialMediaDesigner or AgentType.InstagramContentGenerator
                or AgentType.SeoSpecialist or AgentType.UiUxDesigner or AgentType.VideoEditor => "content_ideation",
            AgentType.AnalyticsAnalyst => "traffic_analysis",
            AgentType.GoogleAdsAnalyst or AgentType.AiStrategist or AgentType.AiCeo => "campaign_analysis",
            _ => "single_review_response"
        };
    }

    private static string BuildTaskTitle(Agent agent, string taskType)
    {
        return $"{agent.DisplayName}: {taskType.Replace("_", " ")}";
    }

    private static string BuildTaskDescription(Agent agent, string taskType)
    {
        return $"Delegated {taskType.Replace("_", " ")} execution through the internal CrewAI orchestration service for agent {agent.DisplayName}.";
    }

    private static int EstimateTaskDurationMinutes(AgentType agentType, string taskType)
    {
        if (taskType.Contains("video", StringComparison.OrdinalIgnoreCase) ||
            taskType.Contains("reel", StringComparison.OrdinalIgnoreCase))
            return 12;

        if (taskType.Contains("content", StringComparison.OrdinalIgnoreCase) ||
            taskType.Contains("instagram", StringComparison.OrdinalIgnoreCase))
            return 8;

        if (agentType == AgentType.GoogleAdsAnalyst || agentType == AgentType.AnalyticsAnalyst)
            return 7;

        if (agentType == AgentType.CustomerReviewResponder)
            return 4;

        return 6;
    }

    private static string BuildArtifactContentFallback(string? content, Agent agent, string taskType)
    {
        if (!string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        return
            $"# {agent.DisplayName} Execution Report\n\n" +
            $"The `{taskType}` execution completed without model content.\n\n" +
            "A fallback artifact was created so the task, run, and approval workflow remain traceable. " +
            "Check the CrewAI service logs, integration data availability, and task input before re-running this agent.";
    }

    private static string BuildBriefTitle(Agent agent, JsonElement? inputData)
    {
        if (inputData.HasValue &&
            inputData.Value.ValueKind == JsonValueKind.Object &&
            inputData.Value.TryGetProperty("reviewerName", out var reviewerName))
        {
            return $"Review response for {reviewerName.GetString()}";
        }

        return $"{agent.DisplayName} execution";
    }

    private static CrewBrandContext BuildBrandContext(
        Tenant tenant,
        Office? office,
        List<BrandMemoryDocument> brandMemories,
        CompanyProfile? profile,
        string promptEnrichment)
    {
        var customRules = profile?.CustomRules ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(promptEnrichment))
            customRules = string.IsNullOrWhiteSpace(customRules) ? promptEnrichment : $"{customRules}\n\n{promptEnrichment}";

        // Inject brand analysis from connected accounts (Instagram, Google Business)
        var assetDescriptions = brandMemories
            .Where(m =>
                m.DocumentType.StartsWith("brand_profile:") ||
                m.DocumentType.StartsWith("executed_action:") ||
                m.DocumentType == "approved_pattern")
            .Take(8)
            .Select(m => $"{m.DocumentType}: {m.Title}")
            .ToList();

        if (!string.IsNullOrWhiteSpace(profile?.InstagramHandle))
            assetDescriptions.Insert(0, $"Instagram hesabı: @{profile.InstagramHandle}");

        if (!string.IsNullOrWhiteSpace(profile?.GoogleBusinessUrl))
            assetDescriptions.Insert(0, $"Google Business: {profile.GoogleBusinessUrl}");

        if (!string.IsNullOrWhiteSpace(profile?.BrandImageUrls))
        {
            var urls = profile.BrandImageUrls.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var url in urls.Take(5))
                assetDescriptions.Add($"Marka görseli: {url}");
        }

        // Brand analysis from automatic account scan — inject as high-priority context
        if (!string.IsNullOrWhiteSpace(profile?.BrandAnalysis))
        {
            customRules = $"## Otomatik Marka Analizi (Hesap Verilerinden)\n{profile.BrandAnalysis}\n\n" + customRules;
        }

        return new CrewBrandContext
        {
            BusinessName = profile?.BrandName ?? office?.Name ?? tenant.Name,
            BusinessType = profile?.Industry ?? "Digital Agency Client Workspace",
            Description = profile?.Description ?? office?.Description ?? $"Managed workspace for {tenant.Name}",
            BrandTone = profile?.BrandTone ?? "professional and warm",
            VisualStyle = profile?.VisualStyle ?? "modern, premium, digitally native",
            TargetAudience = profile?.TargetAudience ?? "local customers and agency-managed growth audiences",
            Location = profile?.Location ?? office?.Name ?? tenant.Name,
            Languages = profile?.Languages ?? "tr",
            CampaignGoals = BuildCampaignGoals(profile),
            Competitors = profile?.Competitors ?? string.Empty,
            CustomRules = customRules,
            Keywords = BuildKeywords(tenant, profile),
            AssetDescriptions = assetDescriptions,
            ContentPillars = ParseJsonStringList(profile?.ContentNeeds),
            RiskRules = ParseJsonStringDictionary(profile?.RiskRules),
            OperatingCapabilities = ParseJsonStringList(profile?.OperatingCapabilities),
            GalleryPolicy = ParseJsonObjectDictionary(profile?.GalleryPolicy),
        };
    }

    private static List<string> ParseJsonStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json)?
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .ToList() ?? new();
        }
        catch
        {
            return new();
        }
    }

    private static Dictionary<string, string> ParseJsonStringDictionary(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                   ?? new Dictionary<string, string>();
        }
        catch
        {
            return new();
        }
    }

    private static Dictionary<string, object?> ParseJsonObjectDictionary(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.ValueKind switch
                {
                    System.Text.Json.JsonValueKind.String => prop.Value.GetString(),
                    System.Text.Json.JsonValueKind.Number => prop.Value.TryGetInt32(out var i) ? i : prop.Value.GetDouble(),
                    System.Text.Json.JsonValueKind.True => true,
                    System.Text.Json.JsonValueKind.False => false,
                    _ => prop.Value.GetRawText(),
                };
            }
            return dict;
        }
        catch
        {
            return new();
        }
    }

    private static string BuildCampaignGoals(CompanyProfile? profile)
    {
        var baseGoals = profile?.CampaignGoals;
        if (string.IsNullOrWhiteSpace(baseGoals))
        {
            baseGoals = "Protect reputation, improve response quality, and create actionable agency workflows.";
        }

        var additions = new List<string>();
        if (!string.IsNullOrWhiteSpace(profile?.TargetAudience))
            additions.Add($"Target audience focus: {profile.TargetAudience}");
        if (!string.IsNullOrWhiteSpace(profile?.Competitors))
            additions.Add($"Competitor awareness: {profile.Competitors}");
        if (!string.IsNullOrWhiteSpace(profile?.WebsiteUrl))
            additions.Add($"Website: {profile.WebsiteUrl}");

        return additions.Count == 0
            ? baseGoals
            : $"{baseGoals}\n{string.Join("\n", additions)}";
    }

    private static string BuildKeywords(Tenant tenant, CompanyProfile? profile)
    {
        var keywords = new List<string> { tenant.Plan };
        if (!string.IsNullOrWhiteSpace(profile?.Industry)) keywords.Add(profile.Industry);
        if (!string.IsNullOrWhiteSpace(profile?.Location)) keywords.Add(profile.Location);
        if (!string.IsNullOrWhiteSpace(profile?.Competitors)) keywords.Add(profile.Competitors);
        return string.Join(", ", keywords.Where(k => !string.IsNullOrWhiteSpace(k)).Distinct());
    }

    private static ArtifactType MapArtifactType(AgentType agentType, string artifactType)
    {
        var normalized = artifactType.Replace("_", string.Empty, StringComparison.OrdinalIgnoreCase);
        var explicitType = normalized.ToLowerInvariant() switch
        {
            "reviewresponse" => ArtifactType.ReviewResponse,
            "blogpost" => ArtifactType.BlogPost,
            "socialmediagraphic" => ArtifactType.SocialMediaGraphic,
            "instagramcaption" => ArtifactType.InstagramCaption,
            "seoreport" => ArtifactType.SeoReport,
            "adcopy" => ArtifactType.AdCopy,
            "videoedit" => ArtifactType.VideoEdit,
            "uimockup" => ArtifactType.UiMockup,
            "strategydocument" => ArtifactType.StrategyDocument,
            "chatbotflow" => ArtifactType.ChatbotFlow,
            "genericdocument" => ArtifactType.GenericDocument,
            _ => (ArtifactType?)null
        };

        if (explicitType.HasValue)
        {
            return explicitType.Value;
        }

        if (Enum.TryParse<ArtifactType>(artifactType, true, out var parsed))
        {
            return parsed;
        }

        return agentType switch
        {
            AgentType.CustomerReviewResponder or AgentType.ChatbotManager => ArtifactType.ReviewResponse,
            AgentType.BlogWriter or AgentType.SeoSpecialist => ArtifactType.BlogPost,
            AgentType.SocialMediaDesigner => ArtifactType.SocialMediaGraphic,
            AgentType.InstagramContentGenerator => ArtifactType.InstagramCaption,
            AgentType.UiUxDesigner => ArtifactType.UiMockup,
            AgentType.VideoEditor => ArtifactType.VideoEdit,
            AgentType.GoogleAdsAnalyst => ArtifactType.AdCopy,
            AgentType.AnalyticsAnalyst => ArtifactType.StrategyDocument,
            AgentType.ContentStrategy or AgentType.AiStrategist or AgentType.AiCeo => ArtifactType.StrategyDocument,
            _ => ArtifactType.GenericDocument
        };
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
