using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BriefsController : ControllerBase
{
    private readonly IBriefService _briefService;
    private readonly IRequestContext _requestContext;

    public BriefsController(IBriefService briefService, IRequestContext requestContext)
    {
        _briefService = briefService;
        _requestContext = requestContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<BriefDto>>> GetBriefs(CancellationToken cancellationToken)
    {
        var briefs = await _briefService.GetBriefsByTenantAsync(_requestContext.TenantId, cancellationToken);
        return Ok(briefs);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<BriefDto>> GetBriefById(Guid id, CancellationToken cancellationToken)
    {
        var brief = await _briefService.GetBriefByIdAsync(id, _requestContext.TenantId, cancellationToken);
        if (brief == null)
            return NotFound();

        return Ok(brief);
    }

    [HttpPost]
    public async Task<ActionResult<BriefDto>> CreateBrief(CreateBriefRequest request, CancellationToken cancellationToken)
    {
        var brief = await _briefService.CreateBriefAsync(_requestContext.TenantId, _requestContext.UserId, request, cancellationToken);
        return CreatedAtAction(nameof(GetBriefById), new { id = brief.Id }, brief);
    }

    [HttpPost("{id}/submit")]
    public async Task<ActionResult<BriefDto>> SubmitBrief(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var brief = await _briefService.SubmitBriefAsync(id, _requestContext.TenantId, cancellationToken);
            return Ok(brief);
        }
        catch (InvalidOperationException)
        {
            // Either does not exist OR belongs to another tenant — same 404 either way (no enumeration).
            return NotFound();
        }
    }
}
