# Nexus AI Agent Office Backend API

A complete .NET 8 backend solution for the "AI Agent Office OS" SaaS platform.

## Architecture Overview

The solution follows a clean architecture pattern with clear separation of concerns:

- **Nexus.Api**: ASP.NET Core web API host with controllers, SignalR hub
- **Nexus.Application**: Business logic services, AI provider interfaces, DTOs
- **Nexus.Domain**: Domain entities, enums, value objects, interfaces
- **Nexus.Infrastructure**: EF Core DbContext, entity configurations, data access
- **Nexus.Contracts**: Shared DTOs and events for SignalR communication

## Prerequisites

- .NET 8 SDK
- PostgreSQL 12+
- Redis 6+
- Visual Studio 2022 or VS Code

## Getting Started

### 1. Database Setup

Create a PostgreSQL database:

```bash
createdb nexus_api
```

### 2. Redis Setup

Start Redis:

```bash
redis-server
```

### 3. Build the Solution

```bash
cd /sessions/busy-dazzling-gates/mnt/SmartAgency/apps/api
dotnet build
```

### 4. Apply Migrations

```bash
cd src/Nexus.Api
dotnet ef database update --project ../Nexus.Infrastructure
```

Or migrations will apply automatically on startup.

### 5. Run the API

```bash
cd src/Nexus.Api
dotnet run
```

The API will be available at `https://localhost:5001` and `http://localhost:5000`

Swagger UI: `http://localhost:5000`

## Project Structure

```
src/
├── Nexus.Api/
│   ├── Controllers/          # REST API endpoints
│   ├── Hubs/                # SignalR hub for real-time updates
│   ├── Program.cs           # Application entry point
│   └── appsettings.json     # Configuration
├── Nexus.Application/
│   ├── Services/            # Business logic services
│   ├── Interfaces/          # Service contracts and AI provider interface
│   └── Providers/           # AI provider implementations (Mock)
├── Nexus.Domain/
│   ├── Entities/            # Domain entities
│   ├── Enums/              # Enumeration types
│   └── Common/             # Base classes and interfaces
├── Nexus.Infrastructure/
│   └── Data/
│       ├── NexusDbContext.cs          # EF Core DbContext
│       ├── Configurations/            # Entity configurations
│       ├── ModelBuilderExtensions.cs  # Query filters
│       └── SeedData.cs               # Initial data seeding
└── Nexus.Contracts/
    ├── Dtos/               # Data transfer objects
    └── Events/             # SignalR events
```

## Domain Entities

### Core Entities
- **Tenant**: Multi-tenant SaaS account
- **User**: Platform users
- **Office**: Virtual office space containing zones and agents
- **OfficeZone**: Specialized work areas (CommandCenter, ContentStudio, etc.)
- **Agent**: AI agents with specific types and capabilities

### Workflow Entities
- **Brief**: User-submitted project requirements
- **TaskItem**: Individual tasks decomposed from briefs
- **TaskAssignment**: Assignments of tasks to agents
- **TaskDependency**: Dependencies between tasks

### Execution Entities
- **AgentRun**: Execution record for an agent working on a task
- **OutputArtifact**: Generated outputs (blog posts, graphics, etc.)
- **ReviewDecision**: Approval/rejection decisions on artifacts

### Support Entities
- **AgentCapability**: Capabilities and skills of agents
- **BriefAttachment**: File attachments to briefs
- **Notification**: User notifications for events
- **AuditLog**: System audit trail
- **BrandMemoryDocument**: Brand guidelines and context
- **AgentMemoryReference**: Agent-specific memory/context

## Enum Types

### AgentType
AiCeo, BlogWriter, SocialMediaDesigner, InstagramContentGenerator, UiUxDesigner, VideoEditor, SeoSpecialist, GoogleAdsAnalyst, CustomerReviewResponder, ChatbotManager, AiStrategist

### AgentState
Idle, Working, Collaborating, Blocked, Completed, Error, Offline

### TaskStatus
Pending, Queued, InProgress, WaitingForDependency, WaitingForApproval, Approved, Rejected, RevisionRequested, Completed, Failed, Cancelled

### BriefStatus
Draft, Submitted, Decomposing, Decomposed, InProgress, Completed, Failed

### ArtifactType
BlogPost, SocialMediaGraphic, InstagramCaption, SeoReport, AdCopy, VideoEdit, UiMockup, StrategyDocument, ReviewResponse, ChatbotFlow, GenericDocument

## API Endpoints

### Briefs
- `GET /api/briefs` - List all briefs
- `GET /api/briefs/{id}` - Get brief details
- `POST /api/briefs` - Create new brief
- `POST /api/briefs/{id}/submit` - Submit brief for decomposition

### Tasks
- `GET /api/tasks/brief/{briefId}` - List tasks for a brief
- `GET /api/tasks/{id}` - Get task details
- `PUT /api/tasks/{id}/status` - Update task status
- `POST /api/tasks/{id}/assign` - Assign task to agent

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/{id}` - Get agent details
- `PUT /api/agents/{id}/state` - Update agent state
- `GET /api/agents/office/{officeId}` - List agents in office

### Office
- `GET /api/office` - List offices
- `GET /api/office/default` - Get default office
- `GET /api/office/{id}` - Get office with zones and agents

### Reviews
- `POST /api/reviews/approve` - Approve artifact
- `POST /api/reviews/reject` - Reject artifact
- `POST /api/reviews/request-revision` - Request revision

### Notifications
- `GET /api/notifications` - List user notifications
- `PUT /api/notifications/{id}/mark-read` - Mark notification as read

## SignalR Hub

**Endpoint**: `ws://localhost:5000/hubs/office`

### Client Methods
- `JoinOffice(tenantId, officeId)` - Join office group
- `LeaveOffice(tenantId, officeId)` - Leave office group

### Server Events
- `AgentStateChanged(event)` - Agent state changed
- `TaskStatusChanged(event)` - Task status updated
- `NewNotification(event)` - New notification created
- `OutputReady(event)` - Artifact ready for review
- `BriefDecomposed(event)` - Brief decomposed into tasks

## Services

### BriefService
Handles brief creation, submission, and decomposition using IAiProvider.

### TaskService
Manages task status updates and agent assignments.

### AgentService
Retrieves agent information and manages agent state.

### OfficeService
Manages office and zone data.

### ReviewService
Handles artifact approvals, rejections, and revision requests.

### NotificationService
Creates and manages user notifications.

## AI Provider

The `IAiProvider` interface defines AI capabilities:

- `DecomposeBriefAsync()` - Break down a brief into tasks
- `GenerateContentAsync()` - Generate content with prompt and context
- `AnalyzeContentAsync()` - Analyze content for quality metrics

### MockAiProvider
Default implementation returns realistic mock data for testing.

## Seed Data

On startup, the application creates:
- 1 tenant: "SmartAgency Demo"
- 1 admin user
- 1 office with 6 zones (CommandCenter, ContentStudio, DesignLab, MediaBay, AnalyticsFloor, CommunicationHub)
- 11 agents (all types)
- 1 sample brief for testing

## Configuration

Edit `appsettings.json` to customize:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=nexus_api;Username=postgres;Password=postgres;Port=5432;",
    "Redis": "localhost:6379"
  },
  "Cors": {
    "AllowedOrigins": ["http://localhost:3000"]
  }
}
```

## Security Notes

Current implementation uses placeholder GUIDs for tenant and user context. For production:

1. Implement proper authentication (JWT, OAuth)
2. Extract tenant context from request claims
3. Extract user context from authentication principal
4. Implement authorization policies
5. Add request validation with FluentValidation
6. Implement proper error handling middleware
7. Add comprehensive logging

## Database

The solution uses:
- **Entity Framework Core 8** with PostgreSQL
- **JSONB columns** for flexible configuration storage
- **Soft delete** pattern for audit trail
- **Tenant isolation** via query filters
- **Automatic audit fields** (CreatedAt, UpdatedAt, CreatedBy, UpdatedBy)

## Development

### Add Migration
```bash
cd src/Nexus.Infrastructure
dotnet ef migrations add MigrationName --project ../Nexus.Api
```

### Update Database
```bash
dotnet ef database update --project ../Nexus.Api
```

### Run Tests
```bash
dotnet test
```

## Deployment

### Docker

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY . .
RUN dotnet build

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/src/Nexus.Api/bin/Release/net8.0 .
ENTRYPOINT ["dotnet", "Nexus.Api.dll"]
```

### Environment Variables

```
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=<db-connection-string>
ConnectionStrings__Redis=<redis-connection-string>
```

## License

Proprietary - SmartAgency
