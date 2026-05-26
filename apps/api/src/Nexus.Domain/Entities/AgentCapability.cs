using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class AgentCapability : BaseEntity
{
    public Guid AgentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string InputSchema { get; set; } = "{}";
    public string OutputSchema { get; set; } = "{}";
    public int Priority { get; set; }

    public Agent? Agent { get; set; }
}
