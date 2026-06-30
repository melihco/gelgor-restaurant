import asyncio, json, sys
import asyncpg

IDS = [
    "7876b8c9-4706-4459-ba04-e9a04145702c",
    "e0994781-e388-4984-89d7-4272bf3adc60",
    "6e38537b-7b7a-42de-ba04-53589f912a4d",
    "3ae6d318-0554-4366-9ce7-690d13ee66e8",
]

async def main():
    conn = await asyncpg.connect("postgresql://nexus:nexus_dev_2024@localhost:5432/nexus_db")
    for aid in IDS:
        row = await conn.fetchrow(
            'SELECT "Id", "ArtifactType", "Metadata" FROM "OutputArtifacts" WHERE "Id"::text = $1',
            aid,
        )
        if not row:
            print(f"{aid} | NOT FOUND")
            continue
        meta = json.loads(row["Metadata"]) if row["Metadata"] else {}
        url = (
            meta.get("imageUrl")
            or meta.get("videoUrl")
            or meta.get("mediaUrl")
            or meta.get("image_url")
            or meta.get("url", "")
        )
        kind = meta.get("kind", "")
        caption = (meta.get("caption") or "")[:60]
        headline = (meta.get("headline") or "")[:40]
        source = meta.get("source", "")
        print(f"{aid} | {kind} | {source} | {headline or caption} | {url[:150]}")
    await conn.close()

asyncio.run(main())
