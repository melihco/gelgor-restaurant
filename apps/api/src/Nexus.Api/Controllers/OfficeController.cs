using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OfficeController : ControllerBase
{
    private readonly IOfficeService _officeService;
    private readonly IRequestContext _requestContext;

    public OfficeController(IOfficeService officeService, IRequestContext requestContext)
    {
        _officeService = officeService;
        _requestContext = requestContext;
    }

    [HttpGet]
    public async Task<ActionResult<List<OfficeDto>>> GetOffices(CancellationToken cancellationToken)
    {
        var offices = await _officeService.GetOfficesByTenantAsync(_requestContext.TenantId, cancellationToken);
        return Ok(offices);
    }

    [HttpGet("default")]
    public async Task<ActionResult<OfficeDto>> GetDefaultOffice(CancellationToken cancellationToken)
    {
        var office = await _officeService.GetDefaultOfficeAsync(_requestContext.TenantId, cancellationToken);
        return Ok(office);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<OfficeDetailDto>> GetOfficeDetail(Guid id, CancellationToken cancellationToken)
    {
        var office = await _officeService.GetOfficeDetailAsync(id, _requestContext.TenantId, cancellationToken);
        if (office == null)
            return NotFound();

        return Ok(office);
    }
}
