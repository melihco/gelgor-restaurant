# Nexus API Reference

Complete API endpoint documentation for the AI Agent Office Backend.

---

## Base URL
```
http://localhost:5000
https://localhost:5001
```

## Authentication
Currently using placeholder tenant/user IDs. Production requires JWT authentication.

---

## Briefs API

### List All Briefs
```http
GET /api/briefs
```

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Product Launch Campaign",
    "description": "Marketing campaign...",
    "status": "Draft",
    "createdAt": "2024-04-03T10:30:00Z",
    "updatedAt": "2024-04-03T10:30:00Z",
    "submittedAt": null,
    "decomposedAt": null,
    "completedAt": null
  }
]
```

### Get Brief by ID
```http
GET /api/briefs/{id}
```

**Response:** Single brief object (same schema as above)

### Create Brief
```http
POST /api/briefs
Content-Type: application/json

{
  "title": "Product Launch Campaign",
  "description": "Complete marketing campaign for new product",
  "rawContent": "Full brief content describing the project..."
}
```

**Response:** `201 Created`
```json
{
  "id": "new-uuid",
  "title": "Product Launch Campaign",
  "description": "Complete marketing campaign for new product",
  "status": "Draft",
  "createdAt": "2024-04-03T10:30:00Z",
  "updatedAt": "2024-04-03T10:30:00Z",
  "submittedAt": null,
  "decomposedAt": null,
  "completedAt": null
}
```

### Submit Brief for Decomposition
```http
POST /api/briefs/{id}/submit
```

**Response:** Brief object with `status: "Decomposing"`

**Note:** Decomposition happens asynchronously and triggers background task creation.

---

## Tasks API

### List Tasks for a Brief
```http
GET /api/tasks/brief/{briefId}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "briefId": "parent-brief-uuid",
    "title": "Research and Planning",
    "description": "Conduct research...",
    "agentType": "AiStrategist",
    "status": "Pending",
    "priority": "Normal",
    "createdAt": "2024-04-03T10:30:00Z",
    "updatedAt": "2024-04-03T10:30:00Z",
    "startedAt": null,
    "completedAt": null
  }
]
```

### Get Task by ID
```http
GET /api/tasks/{id}
```

**Response:** Single task object (same schema as above)

### Update Task Status
```http
PUT /api/tasks/{id}/status
Content-Type: application/json

{
  "status": "InProgress"
}
```

**Status Values:**
- Pending
- Queued
- InProgress
- WaitingForDependency
- WaitingForApproval
- Approved
- Rejected
- RevisionRequested
- Completed
- Failed
- Cancelled

**Response:** Updated task object

### Assign Task to Agent
```http
POST /api/tasks/{id}/assign
Content-Type: application/json

{
  "agentId": "00000000-0000-0000-0000-000000000003"
}
```

**Response:** Updated task object

---

## Agents API

### List All Agents
```http
GET /api/agents
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "CEO Agent",
    "displayName": "The CEO",
    "avatarUrl": "https://...",
    "agentType": "AiCeo",
    "state": "Idle",
    "isEnabled": true,
    "createdAt": "2024-04-03T10:30:00Z",
    "updatedAt": "2024-04-03T10:30:00Z"
  }
]
```

### Get Agent Details
```http
GET /api/agents/{id}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Blog Writer",
  "displayName": "The Wordsmith",
  "avatarUrl": "https://...",
  "description": "Expert blog and content writer",
  "agentType": "BlogWriter",
  "state": "Idle",
  "isEnabled": true,
  "currentTaskId": null,
  "capabilities": [
    {
      "id": "uuid",
      "name": "Content Writing",
      "description": "Write blog posts and articles",
      "priority": 1
    }
  ],
  "createdAt": "2024-04-03T10:30:00Z",
  "updatedAt": "2024-04-03T10:30:00Z"
}
```

### Update Agent State
```http
PUT /api/agents/{id}/state
Content-Type: application/json

{
  "newState": "Working"
}
```

**State Values:**
- Idle
- Working
- Collaborating
- Blocked
- Completed
- Error
- Offline

**Response:** Updated agent object

### Get Agents in Office
```http
GET /api/agents/office/{officeId}
```

**Response:** Array of agent objects

---

## Office API

### List Offices
```http
GET /api/office
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Main Office",
    "description": "The primary AI Agent Office",
    "isDefault": true,
    "createdAt": "2024-04-03T10:30:00Z",
    "updatedAt": "2024-04-03T10:30:00Z"
  }
]
```

### Get Default Office
```http
GET /api/office/default
```

**Response:** Default office object

### Get Office Details (with Zones and Agents)
```http
GET /api/office/{id}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Main Office",
  "description": "The primary AI Agent Office",
  "isDefault": true,
  "zones": [
    {
      "id": "uuid",
      "zoneType": "CommandCenter",
      "name": "Command Center",
      "positionX": 0,
      "positionY": 0,
      "positionZ": 0,
      "width": 100,
      "depth": 100
    }
  ],
  "agents": [
    {
      "id": "uuid",
      "name": "CEO Agent",
      "displayName": "The CEO",
      "avatarUrl": "https://...",
      "agentType": "AiCeo",
      "state": "Idle",
      "isEnabled": true,
      "createdAt": "2024-04-03T10:30:00Z",
      "updatedAt": "2024-04-03T10:30:00Z"
    }
  ],
  "createdAt": "2024-04-03T10:30:00Z",
  "updatedAt": "2024-04-03T10:30:00Z"
}
```

---

## Reviews API

### Approve Artifact
```http
POST /api/reviews/approve
Content-Type: application/json

{
  "artifactId": "uuid",
  "comment": "Excellent work!"
}
```

**Response:**
```json
{
  "id": "uuid",
  "artifactId": "uuid",
  "status": "Approved",
  "comment": "Excellent work!",
  "createdAt": "2024-04-03T10:30:00Z"
}
```

### Reject Artifact
```http
POST /api/reviews/reject
Content-Type: application/json

{
  "artifactId": "uuid",
  "comment": "Needs improvement"
}
```

**Response:** Review decision object with `status: "Rejected"`

### Request Revision
```http
POST /api/reviews/request-revision
Content-Type: application/json

{
  "artifactId": "uuid",
  "comment": "Please adjust the colors and add more examples"
}
```

**Response:** Review decision object with `status: "RevisionRequested"`

---

## Notifications API

### List User Notifications
```http
GET /api/notifications
```

**Response:**
```json
[
  {
    "id": "uuid",
    "type": "TaskAssigned",
    "title": "New Task Assigned",
    "message": "You have been assigned a new task",
    "isRead": false,
    "relatedEntityId": "task-uuid",
    "relatedEntityType": "TaskItem",
    "createdAt": "2024-04-03T10:30:00Z"
  }
]
```

### Mark Notification as Read
```http
PUT /api/notifications/{id}/mark-read
```

**Response:** Updated notification object with `isRead: true`

---

## Enums

### AgentType
```
AiCeo
BlogWriter
SocialMediaDesigner
InstagramContentGenerator
UiUxDesigner
VideoEditor
SeoSpecialist
GoogleAdsAnalyst
CustomerReviewResponder
ChatbotManager
AiStrategist
```

### AgentState
```
Idle
Working
Collaborating
Blocked
Completed
Error
Offline
```

### TaskStatus
```
Pending
Queued
InProgress
WaitingForDependency
WaitingForApproval
Approved
Rejected
RevisionRequested
Completed
Failed
Cancelled
```

### TaskPriority
```
Low
Normal
High
Urgent
Critical
```

### ArtifactType
```
BlogPost
SocialMediaGraphic
InstagramCaption
SeoReport
AdCopy
VideoEdit
UiMockup
StrategyDocument
ReviewResponse
ChatbotFlow
GenericDocument
```

### ReviewStatus
```
Pending
Approved
Rejected
RevisionRequested
```

### NotificationType
```
TaskAssigned
TaskCompleted
TaskFailed
ApprovalRequired
ApprovalDecision
AgentStateChanged
BriefDecomposed
SystemAlert
```

### OfficeZoneType
```
CommandCenter
ContentStudio
DesignLab
MediaBay
AnalyticsFloor
CommunicationHub
```

### BriefStatus
```
Draft
Submitted
Decomposing
Decomposed
InProgress
Completed
Failed
```

---

## SignalR Hub

**Endpoint:** `ws://localhost:5000/hubs/office`

### Connect & Join Group
```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl("ws://localhost:5000/hubs/office")
  .withAutomaticReconnect()
  .build();

await connection.start();
await connection.invoke("JoinOffice", tenantId, officeId);
```

### Listen to Events
```javascript
// Agent state changed
connection.on("AgentStateChanged", (event) => {
  console.log(event.agentId, event.newState);
});

// Task status changed
connection.on("TaskStatusChanged", (event) => {
  console.log(event.taskId, event.newStatus);
});

// New notification
connection.on("NewNotification", (event) => {
  console.log(event.title, event.message);
});

// Output ready
connection.on("OutputReady", (event) => {
  console.log(event.artifactId, event.artifactType);
});

// Brief decomposed
connection.on("BriefDecomposed", (event) => {
  console.log(event.briefId, event.taskCount, "tasks");
});
```

### Leave Group
```javascript
await connection.invoke("LeaveOffice", tenantId, officeId);
```

---

## Error Responses

### 404 Not Found
```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.4",
  "title": "Not Found",
  "status": 404,
  "detail": "Resource not found"
}
```

### 400 Bad Request
```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid request"
}
```

### 500 Internal Server Error
```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.6.1",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred"
}
```

---

## Rate Limiting

Currently not implemented. Recommended for production.

---

## CORS

Configured for:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:5173`

---

## Default IDs for Testing

```
Tenant ID:      00000000-0000-0000-0000-000000000001
User ID:        00000000-0000-0000-0000-000000000001
Office ID:      00000000-0000-0000-0000-000000000002
```

---

## Pagination

Not currently implemented. Recommended for production.

---

## Versioning

API is currently v1. Consider implementing API versioning for future changes.

---

For more details, see:
- README.md - Full documentation
- QUICKSTART.md - Getting started
- SOLUTION_SUMMARY.md - Architecture overview
