# Quick Start Guide - Nexus API

Get the backend API running in 5 minutes.

## Prerequisites

- .NET 8 SDK [Download](https://dotnet.microsoft.com/download/dotnet/8.0)
- PostgreSQL [Download](https://www.postgresql.org/download/)
- Redis [Download](https://redis.io/download)

## Setup Steps

### 1. Create Database (30 seconds)

**Windows (PowerShell):**
```powershell
# Ensure PostgreSQL is running, then:
createdb -U postgres nexus_api
```

**macOS/Linux:**
```bash
createdb nexus_api
```

### 2. Start Redis (10 seconds)

**Windows (if installed with Chocolatey):**
```cmd
redis-server
```

**macOS (with Homebrew):**
```bash
redis-server
```

**Docker (any OS):**
```bash
docker run -d -p 6379:6379 redis
```

### 3. Build Solution (60 seconds)

```bash
cd /sessions/busy-dazzling-gates/mnt/SmartAgency/apps/api
dotnet build
```

### 4. Run the API (30 seconds)

```bash
cd src/Nexus.Api
dotnet run
```

You should see:
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5000
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: https://localhost:5001
```

### 5. Open Swagger UI

Visit: **http://localhost:5000**

You'll see the Swagger documentation with all available endpoints.

---

## Verify Everything Works

### Test the API with curl:

```bash
# Get all agents
curl http://localhost:5000/api/agents

# Get default office
curl http://localhost:5000/api/office/default

# Create a brief
curl -X POST http://localhost:5000/api/briefs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Brief",
    "description": "A test brief",
    "rawContent": "Test content"
  }'
```

### Test SignalR Hub:

Use a WebSocket client to connect to:
```
ws://localhost:5000/hubs/office
```

Send message:
```json
{
  "target": "JoinOffice",
  "arguments": [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002"
  ]
}
```

---

## Default Credentials & IDs

### Demo Tenant
- **ID**: `00000000-0000-0000-0000-000000000001`
- **Name**: SmartAgency Demo
- **Slug**: smartagency-demo

### Admin User
- **ID**: `00000000-0000-0000-0000-000000000001`
- **Email**: admin@smartagency.demo
- **Role**: Admin

### Default Office
- **ID**: `00000000-0000-0000-0000-000000000002`
- **Name**: Main Office

### 11 Pre-created Agents
- AI CEO
- Blog Writer
- Social Media Designer
- Instagram Content Generator
- UI/UX Designer
- Video Editor
- SEO Specialist
- Google Ads Analyst
- Customer Review Responder
- Chatbot Manager
- AI Strategist

---

## Database Schema

The database is automatically created and seeded with sample data on first run.

Tables created:
- Tenants
- Users
- Offices
- OfficeZones
- Agents
- AgentCapabilities
- Briefs
- BriefAttachments
- TaskItems
- TaskDependencies
- TaskAssignments
- AgentRuns
- OutputArtifacts
- ReviewDecisions
- Notifications
- AuditLogs
- BrandMemoryDocuments
- AgentMemoryReferences

---

## Common Tasks

### Create a Brief
```bash
curl -X POST http://localhost:5000/api/briefs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q1 Marketing Campaign",
    "description": "Launch new product marketing",
    "rawContent": "Full campaign requirements..."
  }'
```

### Submit Brief for Decomposition
```bash
curl -X POST http://localhost:5000/api/briefs/{briefId}/submit \
  -H "Content-Type: application/json"
```

### List All Tasks for a Brief
```bash
curl http://localhost:5000/api/tasks/brief/{briefId}
```

### Assign Task to Agent
```bash
curl -X POST http://localhost:5000/api/tasks/{taskId}/assign \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "00000000-0000-0000-0000-000000000003"
  }'
```

### Update Task Status
```bash
curl -X PUT http://localhost:5000/api/tasks/{taskId}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "InProgress"}'
```

### Get Agent Details
```bash
curl http://localhost:5000/api/agents/{agentId}
```

### Change Agent State
```bash
curl -X PUT http://localhost:5000/api/agents/{agentId}/state \
  -H "Content-Type: application/json" \
  -d '{"newState": "Working"}'
```

### Get Office with Zones and Agents
```bash
curl http://localhost:5000/api/office/{officeId}
```

### Approve Artifact
```bash
curl -X POST http://localhost:5000/api/reviews/approve \
  -H "Content-Type: application/json" \
  -d '{
    "artifactId": "...",
    "comment": "Looks great!"
  }'
```

---

## Configuration

Edit `src/Nexus.Api/appsettings.json` to change:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=nexus_api;Username=postgres;Password=postgres;Port=5432;",
    "Redis": "localhost:6379"
  }
}
```

---

## Troubleshooting

### Port 5000 Already in Use
```bash
# Use different port
dotnet run --urls "http://localhost:5002"
```

### Database Connection Failed
- Verify PostgreSQL is running
- Check connection string in appsettings.json
- Verify database exists: `psql -l`

### Redis Connection Failed
- Verify Redis is running on port 6379
- Check connection string
- Or use Docker: `docker run -d -p 6379:6379 redis`

### Migrations Failed
```bash
# Force database drop and recreate
cd src/Nexus.Infrastructure
dotnet ef database drop
dotnet ef database update --project ../Nexus.Api
```

---

## Next: Connect Your Frontend

Frontend should connect to:
- **API Base URL**: `http://localhost:5000`
- **SignalR Hub**: `ws://localhost:5000/hubs/office`
- **Swagger Docs**: `http://localhost:5000`

Example CORS-enabled origins in appsettings.json:
- `http://localhost:3000` (React)
- `http://localhost:3001` (Alternative)
- `http://localhost:5173` (Vite)

---

## Production Deployment

For production:
1. Update appsettings.Production.json with real database
2. Set `ASPNETCORE_ENVIRONMENT=Production`
3. Configure HTTPS certificates
4. Enable authentication/authorization
5. Set up proper logging
6. Configure Redis for cache
7. Use environment variables for secrets

See README.md for full documentation.

---

## Support

- **Swagger/OpenAPI**: http://localhost:5000
- **Solution Summary**: See SOLUTION_SUMMARY.md
- **Full README**: See README.md

Happy coding!
