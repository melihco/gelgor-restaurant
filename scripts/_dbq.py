import asyncio, os, sys, re
import asyncpg

def _dsn():
    raw = ""
    with open(os.path.join(os.path.dirname(__file__), "..", "backend", ".env")) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                raw = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    raw = raw.replace("postgresql+asyncpg://", "postgresql://")
    return raw

async def main():
    sql = sys.argv[1]
    args = sys.argv[2:]
    conn = await asyncpg.connect(_dsn())
    try:
        rows = await conn.fetch(sql, *args)
        if not rows:
            print("(0 rows)")
            return
        cols = list(rows[0].keys())
        print(" | ".join(cols))
        print("-" * 60)
        for r in rows:
            print(" | ".join(str(r[c])[:120] for c in cols))
    finally:
        await conn.close()

asyncio.run(main())
