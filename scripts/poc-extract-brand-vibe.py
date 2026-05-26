#!/usr/bin/env python3
"""
PoC: Brand Vibe Profile extraction from reference Instagram accounts.

Given 1-N agency-quality Instagram handles, scrapes recent posts and uses
GPT-4o Vision to extract a structured "vibe profile" — palette, typography,
motion, grading, audio mood, composition patterns, caption voice.

This is a validation script: run it, inspect the JSON output, refine the
extraction prompt, then bake the final schema into the system.

Usage (three modes, can combine):

    cd backend && source .venv/bin/activate

    # 1) Apify mode — scrape handles (requires APIFY_API_KEY and free quota)
    python3 ../scripts/poc-extract-brand-vibe.py --handles thesummerroom.co aoba.studio

    # 2) Direct URL mode — pass image URLs (e.g. right-click → copy image address on IG posts)
    python3 ../scripts/poc-extract-brand-vibe.py --images \
        "https://scontent.cdninstagram.com/.../img1.jpg" \
        "https://scontent.cdninstagram.com/.../img2.jpg" \
        --label thesummerroom.co

    # 3) Local files mode — point to a folder of reference images
    python3 ../scripts/poc-extract-brand-vibe.py --files ~/Downloads/summer-refs/ --label thesummerroom.co

Output is written to ./poc-vibe-{label}-{timestamp}.json
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Load .env from backend dir
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

# pylint: disable=wrong-import-position
from app.crew.apify_scraper import fetch_instagram_apify  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# Vibe extraction prompt — this is the schema we want GPT to fill.
# Iterate on this prompt freely; output is JSON.
# ─────────────────────────────────────────────────────────────────────────────

VIBE_EXTRACTION_SYSTEM_PROMPT = """You are a senior creative director at a top-tier social-media agency
(think: agencies producing content for high-end hospitality, fashion, lifestyle brands).

You will be shown 8-15 representative images from one or more reference Instagram accounts.
Your job is to reverse-engineer the "vibe DNA" of these accounts — the underlying creative
system that makes their content feel consistent, intentional, and elevated.

Return a SINGLE JSON object that matches this schema exactly. No commentary, no markdown,
no code fences — just the JSON.

{
  "palette": {
    "primary": "#xxxxxx",       // dominant color (most-used)
    "accent": "#xxxxxx",        // secondary brand color
    "neutral": "#xxxxxx",       // background/neutral tone
    "shadow": "#xxxxxx",        // deepest tone
    "palette_description": "2-3 sentences describing the palette's mood and emotional register"
  },

  "typography": {
    "heading_personality": "describe the heading style they use (serif/sans, weight, case, tracking) — e.g. 'classic editorial serif, lowercase, tight tracking, often italicized'",
    "body_personality": "describe the body/secondary typography",
    "text_overlay_density": "minimal" | "medium" | "dense",
    "typography_role": "describe HOW typography is used: 'sparingly as poetic punctuation' | 'as primary hero element' | 'as functional caption only' | etc."
  },

  "motion": {
    "pace": "slow_observational" | "rhythmic" | "kinetic",
    "cuts_per_10_seconds_estimate": <number>,
    "camera_movement": "describe the camera grammar — e.g. 'subtle parallax, slow push-ins, handheld breathing, locked-off contemplative frames'",
    "shot_grammar": "describe what types of shots they use most — close-up of details, wide environment, hands in frame, etc."
  },

  "grading": {
    "look": "warm_mediterranean" | "cool_editorial" | "film_grain" | "high_contrast" | "natural_documentary" | "muted_pastel" | "golden_hour" | "moody_low_key",
    "lut_directive": "1-2 sentence directive that could be appended to an image-gen prompt to reproduce this look — be specific about exposure, saturation, contrast, tone curve, color cast"
  },

  "audio": {
    "mood": "chill_house" | "ambient_nature" | "lo_fi" | "cinematic_swell" | "acoustic_warm" | "indie_folk" | "jazz_lounge" | "synthwave",
    "description": "what music/sound feels right for this brand"
  },

  "composition": {
    "primary_pattern": "negative_space" | "symmetric" | "off_center" | "rule_of_thirds" | "centered_subject" | "tight_crop",
    "framing_rules": "2-3 specific compositional rules they follow consistently",
    "subject_focus": "what they put in the foreground: people / food / interior / details / landscape / objects"
  },

  "content_pillars_visual": [
    "list 4-6 recurring visual themes you see, e.g. 'sunset over water', 'hands holding drinks', 'empty plates after meal', 'morning coffee rituals', etc."
  ],

  "what_makes_this_agency_level": "2-4 sentences explaining the specific creative decisions that elevate this above amateur social media — the 'unfair advantage' you'd brief a designer with",

  "anti_patterns": [
    "list 3-5 things this brand NEVER does that amateurs commonly do — e.g. 'no neon graphic overlays', 'no excessive emojis in image', 'no over-saturated stock-photo look', 'no rotation effects on text'"
  ]
}

Be specific, observational, and concrete. Avoid generic adjectives like "modern", "clean",
"professional" — instead describe WHAT you actually see (light direction, dominant hues by
hex, framing choices, type weight).
"""


CAPTION_VOICE_PROMPT = """You will be shown 8-12 recent captions from one or more reference
Instagram accounts. Reverse-engineer the brand voice.

Return JSON only:

{
  "style": "minimal_poetic" | "lowercase_only" | "narrative" | "one_word" | "sensory_descriptive" | "casual_conversational" | "luxe_aspirational",
  "avg_word_count": <number>,
  "uses_emojis": <boolean>,
  "uses_hashtags_in_caption_body": <boolean>,
  "punctuation_style": "describe — e.g. 'minimal punctuation, line breaks for rhythm, no full stops'",
  "tonal_anchors": ["3-5 words describing the emotional register"],
  "writing_rules": ["3-5 specific rules a copywriter could follow to match this voice"],
  "example_template": "give a fill-in-the-blank template based on a typical post — e.g. '[sensory observation] —\\n\\n[place or moment]'"
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────────────────────


async def scrape_accounts(handles: list[str], apify_key: str) -> dict[str, dict]:
    """Scrape each handle sequentially (Apify free-tier memory friendly)."""
    results: dict[str, dict] = {}
    for handle in handles:
        print(f"  → Apify scraping @{handle} ...", flush=True)
        try:
            data = await fetch_instagram_apify(handle, api_key=apify_key, timeout=90)
            results[handle] = data
            print(
                f"    ok: {len(data.get('feed_image_urls', []))} images, "
                f"{len(data.get('recent_captions', []))} captions",
                flush=True,
            )
        except Exception as exc:
            print(f"    FAILED: {exc}", flush=True)
            results[handle] = {"error": str(exc)}
        # Be gentle on Apify
        await asyncio.sleep(2)
    return results


def pick_sample_images(scraped: dict[str, dict], n_per_account: int = 6) -> list[tuple[str, str]]:
    """Pick a balanced sample of (handle, url) tuples."""
    samples: list[tuple[str, str]] = []
    for handle, data in scraped.items():
        urls = (data.get("feed_image_urls") or [])[:n_per_account]
        for u in urls:
            samples.append((handle, u))
    return samples


def collect_captions(scraped: dict[str, dict], n_per_account: int = 6) -> list[str]:
    captions: list[str] = []
    for data in scraped.values():
        captions.extend((data.get("recent_captions") or [])[:n_per_account])
    return captions


async def download_image_as_base64(
    url: str,
    timeout: float = 20.0,
    apify_token: str | None = None,
) -> str | None:
    """Download an image and return data URI.

    Tries direct fetch first; if that fails AND apify_token is provided,
    retries via Apify Proxy (residential IPs whitelisted by Instagram CDN).
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.instagram.com/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }

    async def _try(proxy_url: str | None) -> bytes | None:
        kwargs = {"timeout": timeout, "follow_redirects": True}
        if proxy_url:
            kwargs["proxy"] = proxy_url
        try:
            async with httpx.AsyncClient(**kwargs) as client:
                r = await client.get(url, headers=headers)
            if r.status_code == 200 and r.content:
                return r.content
        except Exception:
            return None
        return None

    content = await _try(None)
    if content is None and apify_token:
        proxy_url = f"http://auto:{apify_token}@proxy.apify.com:8000"
        content = await _try(proxy_url)

    if content is None:
        return None

    # Detect content type from magic bytes (Instagram doesn't always set proper headers)
    if content.startswith(b"\xff\xd8"):
        mime = "image/jpeg"
    elif content.startswith(b"\x89PNG"):
        mime = "image/png"
    elif content.startswith(b"RIFF") and b"WEBP" in content[:20]:
        mime = "image/webp"
    else:
        mime = "image/jpeg"

    b64 = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{b64}"


def load_local_file_as_base64(path: Path) -> str | None:
    """Read a local image file and return data URI."""
    try:
        if not path.exists() or not path.is_file():
            return None
        ext = path.suffix.lower().lstrip(".")
        mime = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "gif": "image/gif", "heic": "image/heic",
        }.get(ext)
        if not mime:
            return None
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


def collect_local_files(spec: str) -> list[Path]:
    """Accept a folder or comma-separated file paths."""
    p = Path(spec).expanduser()
    if p.is_dir():
        files: list[Path] = []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            files.extend(sorted(p.glob(ext)))
        return files
    if p.is_file():
        return [p]
    return []


async def extract_visual_vibe(
    samples: list[tuple[str, str]],
    openai_key: str,
    local_files: list[tuple[str, Path]] | None = None,
) -> dict:
    """Send 8-15 images to GPT-4o Vision with the schema prompt.

    `samples`: list of (label, url) — URL is passed to OpenAI directly
      (OpenAI servers fetch it; bypasses Instagram CDN client restrictions).
      If a URL is unreachable by us, we still hand it to OpenAI; if OpenAI
      also fails, the model returns less detail.
    `local_files`: list of (label, path) — read from disk → base64 data URI.
    """
    import openai

    image_refs: list[tuple[str, str]] = []  # (label, data_uri or url)

    if local_files:
        print(f"  → Loading {len(local_files)} local image files ...", flush=True)
        for label, path in local_files:
            uri = load_local_file_as_base64(path)
            if uri:
                image_refs.append((label, uri))
            else:
                print(f"    skip (unreadable): {path}", flush=True)

    if samples:
        apify_token = os.getenv("APIFY_API_KEY")
        print(
            f"  → Downloading {len(samples)} URLs "
            f"(direct → Apify proxy fallback) ...",
            flush=True,
        )
        for handle, url in samples:
            uri = await download_image_as_base64(url, apify_token=apify_token)
            if uri:
                image_refs.append((handle, uri))
                print(f"    ✓ {url[:70]}", flush=True)
            else:
                print(f"    ✗ {url[:70]}", flush=True)

    print(f"\n    {len(image_refs)} images ready for Vision", flush=True)

    if len(image_refs) < 3:
        return {"error": "not enough images available", "count": len(image_refs)}

    client = openai.AsyncOpenAI(api_key=openai_key)

    user_content: list[dict] = [
        {
            "type": "text",
            "text": (
                f"Reference accounts: {', '.join(set(h for h, _ in image_refs))}.\n"
                f"Below are {len(image_refs)} representative posts. Extract the vibe DNA."
            ),
        }
    ]
    for _handle, ref in image_refs[:15]:  # max 15 images
        user_content.append({"type": "image_url", "image_url": {"url": ref, "detail": "low"}})

    print("  → GPT-4o Vision extraction ...", flush=True)
    t0 = time.time()
    resp = await client.chat.completions.create(
        model="gpt-4o",
        max_tokens=2000,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": VIBE_EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )
    elapsed = time.time() - t0
    print(f"    Vision done in {elapsed:.1f}s", flush=True)

    raw = resp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = {"parse_error": True, "raw": raw}
    return parsed


async def extract_caption_voice(captions: list[str], openai_key: str) -> dict:
    if not captions:
        return {"error": "no captions"}

    import openai

    client = openai.AsyncOpenAI(api_key=openai_key)

    formatted = "\n\n---\n\n".join(f"{i + 1}. {c}" for i, c in enumerate(captions[:12]))
    print("  → GPT-4o caption voice extraction ...", flush=True)
    t0 = time.time()
    resp = await client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1000,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": CAPTION_VOICE_PROMPT},
            {"role": "user", "content": f"Captions:\n\n{formatted}"},
        ],
    )
    elapsed = time.time() - t0
    print(f"    Caption analysis done in {elapsed:.1f}s", flush=True)

    raw = resp.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except Exception:
        return {"parse_error": True, "raw": raw}


async def main_async(args) -> dict:
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise SystemExit("OPENAI_API_KEY missing in backend/.env")

    print("\n=== Brand Vibe PoC ===")
    handles = [h.lstrip("@").strip() for h in (args.handles or [])]
    label = args.label or (handles[0] if handles else "unknown")

    samples: list[tuple[str, str]] = []
    captions: list[str] = []
    scraped: dict[str, dict] = {}

    if handles:
        apify_key = os.getenv("APIFY_API_KEY")
        if not apify_key:
            print("APIFY_API_KEY missing — skipping Apify mode")
        else:
            print(f"\n[Apify] Scraping {len(handles)} handles ...")
            scraped = await scrape_accounts(handles, apify_key)
            samples = pick_sample_images(scraped, n_per_account=args.sample)
            captions = collect_captions(scraped, n_per_account=args.sample)

    if args.images:
        print(f"\n[Direct URLs] {len(args.images)} URLs added")
        samples.extend((label, u) for u in args.images)

    local_files: list[tuple[str, Path]] = []
    if args.files:
        for spec in args.files:
            for path in collect_local_files(spec):
                local_files.append((label, path))
        print(f"\n[Local files] {len(local_files)} files added")

    if not samples and not local_files:
        return {
            "error": "no sources provided",
            "hint": "use --handles, --images, or --files",
            "scraped": scraped,
        }

    print(
        f"\nTotal inputs: "
        f"{len(samples)} URLs + {len(local_files)} files + "
        f"{len(captions)} captions\n"
    )

    print("[Vision] Extracting visual vibe with GPT-4o ...")
    visual = await extract_visual_vibe(samples, openai_key, local_files=local_files)

    voice: dict = {}
    if captions:
        print("\n[Voice] Extracting caption voice ...")
        voice = await extract_caption_voice(captions, openai_key)
    else:
        print("\n[Voice] No captions — skipping voice extraction")

    vibe = {
        "source_label": label,
        "source_accounts": handles,
        "extracted_at": datetime.utcnow().isoformat() + "Z",
        "image_sample_count": len(samples) + len(local_files),
        "caption_sample_count": len(captions),
        **visual,
        "caption_voice": voice,
        "reference_frames": (
            [{"url": url, "source_account": h} for h, url in samples]
            + [{"file": str(p), "source_account": h} for h, p in local_files]
        ),
    }
    return vibe


def main() -> int:
    parser = argparse.ArgumentParser(description="PoC: extract Brand Vibe Profile")
    parser.add_argument("--handles", nargs="*", help="Instagram handles (Apify mode)")
    parser.add_argument("--images", nargs="*", help="Direct image URLs to analyze")
    parser.add_argument(
        "--files", nargs="*", help="Local file paths or folder(s) containing images",
    )
    parser.add_argument("--label", help="Label for the vibe set (e.g. 'thesummerroom.co')")
    parser.add_argument(
        "--sample", type=int, default=6,
        help="Images per handle (Apify mode only, default 6)",
    )
    args = parser.parse_args()

    if not args.handles and not args.images and not args.files:
        parser.error("provide at least one of --handles, --images, --files")

    vibe = asyncio.run(main_async(args))

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    label = args.label or (args.handles[0] if args.handles else "unknown")
    safe_label = label.replace("/", "_").replace("@", "")
    out_path = REPO_ROOT / f"poc-vibe-{safe_label}-{timestamp}.json"
    out_path.write_text(json.dumps(vibe, indent=2, ensure_ascii=False))
    print(f"\n=== Done ===\nOutput: {out_path}\n")

    # Print a compact summary
    if isinstance(vibe.get("palette"), dict):
        p = vibe["palette"]
        print("Palette:")
        print(f"  primary  = {p.get('primary')}")
        print(f"  accent   = {p.get('accent')}")
        print(f"  neutral  = {p.get('neutral')}")
        print(f"  shadow   = {p.get('shadow')}")
    if isinstance(vibe.get("grading"), dict):
        print(f"\nGrading: {vibe['grading'].get('look')}")
        print(f"LUT: {vibe['grading'].get('lut_directive', '')[:200]}")
    if isinstance(vibe.get("motion"), dict):
        print(f"\nMotion pace: {vibe['motion'].get('pace')}")
    if isinstance(vibe.get("caption_voice"), dict):
        cv = vibe["caption_voice"]
        print(f"\nCaption voice: {cv.get('style')} | avg {cv.get('avg_word_count')} words")

    return 0


if __name__ == "__main__":
    sys.exit(main())
