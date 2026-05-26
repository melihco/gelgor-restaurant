# Sprint 8: Qdrant Vector Brand Memory

Sprint 8 connects brand memory to semantic retrieval while preserving the existing relational fallback.

## Goal

Agent prompts should retrieve the most relevant brand memory by meaning, not only by recency.

## Runtime Behavior

When a brand memory document is created from:

- approved artifact patterns
- rejected artifact reasons
- executed actions

the API tries to:

1. create an OpenAI embedding
2. ensure the Qdrant collection exists
3. upsert the memory point with tenant-scoped payload
4. store the memory document id as `EmbeddingId`

If Qdrant or OpenAI embeddings are not configured, the product continues to work with relational fallback memory.

## Prompt Enrichment

`BrandLearningService.BuildPromptEnrichmentAsync` now builds:

- profile intelligence
- learned rules
- approved/rejected patterns
- campaign/action history
- semantic memory retrieval from Qdrant when available
- relational recent-output fallback when vector results are unavailable

The prompt block marks the source as either:

- `Qdrant semantic retrieval`
- `relational recent-output fallback`

## Local Configuration

Local `appsettings*.json` keeps vector memory disabled by default:

```json
"Qdrant": {
  "Enabled": false,
  "BaseUrl": "http://localhost:6333",
  "ApiKey": "nexus_vector_dev",
  "Collection": "brand_memory",
  "VectorSize": 1536
}
```

Enable locally only when Qdrant is running and `OPENAI_API_KEY` is available:

```bash
Qdrant__Enabled=true \
OpenAI__ApiKey=$OPENAI_API_KEY \
dotnet run --urls http://127.0.0.1:5050
```

## Docker Compose

Docker compose enables Qdrant by default for the API service:

```yaml
Qdrant__Enabled: ${QDRANT_ENABLED:-true}
Qdrant__BaseUrl: http://qdrant:6333
Qdrant__ApiKey: ${QDRANT_API_KEY:-nexus_vector_dev}
Qdrant__Collection: ${QDRANT_COLLECTION:-brand_memory}
OpenAI__EmbeddingModel: ${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}
```

Embedding generation still requires:

```bash
OPENAI_API_KEY=...
```

## Safety

- Vector retrieval is tenant-filtered through Qdrant payload filter.
- Qdrant/OpenAI failures are logged as warnings and do not fail artifact approval, rejection, action execution, or agent prompt enrichment.
- Relational memory remains the source of truth; Qdrant is an acceleration and retrieval layer.

## Reindex Existing Memory

Check readiness first:

```bash
curl http://127.0.0.1:5050/api/setup/vector-memory/status
```

Existing `BrandMemoryDocument` rows can be backfilled into Qdrant with:

```bash
curl -X POST http://127.0.0.1:5050/api/setup/vector-memory/reindex \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"
```

The response reports how many relational memory documents were processed:

```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "totalDocuments": 12,
  "embeddedDocuments": 12,
  "skippedDocuments": 0,
  "message": "Brand memory documents were indexed into vector memory."
}
```

If Qdrant or OpenAI is disabled, `embeddedDocuments` will be `0` and the app will continue using relational fallback.

## Next Steps

- Add retrieval diagnostics to AgentRun execution logs.
- Add score thresholds and category-aware query shaping per agent type.
