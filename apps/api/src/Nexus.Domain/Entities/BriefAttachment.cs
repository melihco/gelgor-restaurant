using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class BriefAttachment : BaseEntity
{
    public Guid BriefId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public long FileSize { get; set; }

    public Brief? Brief { get; set; }
}
