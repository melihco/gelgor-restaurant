using Microsoft.AspNetCore.Mvc;
using Nexus.Api.Services;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly ITaskService _taskService;
    private readonly IRequestContext _requestContext;

    public TasksController(ITaskService taskService, IRequestContext requestContext)
    {
        _taskService = taskService;
        _requestContext = requestContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<TaskDto>>> GetRecentTasks([FromQuery] int limit = 80, CancellationToken cancellationToken = default)
    {
        var tasks = await _taskService.GetRecentTasksAsync(_requestContext.TenantId, limit, cancellationToken);
        return Ok(tasks);
    }

    [HttpGet("brief/{briefId}")]
    public async Task<ActionResult<List<TaskDto>>> GetTasksByBrief(Guid briefId, CancellationToken cancellationToken)
    {
        var tasks = await _taskService.GetTasksByBriefAsync(briefId, cancellationToken);
        return Ok(tasks);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<TaskDto>> GetTaskById(Guid id, CancellationToken cancellationToken)
    {
        var task = await _taskService.GetTaskByIdAsync(id, cancellationToken);
        if (task == null)
            return NotFound();

        return Ok(task);
    }

    [HttpPut("{id}/status")]
    public async Task<ActionResult<TaskDto>> UpdateTaskStatus(Guid id, UpdateTaskStatusRequest request, CancellationToken cancellationToken)
    {
        var task = await _taskService.UpdateTaskStatusAsync(id, request.Status, cancellationToken);
        return Ok(task);
    }

    [HttpPost("{id}/assign")]
    public async Task<ActionResult<TaskDto>> AssignTask(Guid id, AssignTaskRequest request, CancellationToken cancellationToken)
    {
        var task = await _taskService.AssignTaskAsync(id, request.AgentId, cancellationToken);
        return Ok(task);
    }
}
