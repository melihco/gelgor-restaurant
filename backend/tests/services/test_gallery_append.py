"""Gallery append + /api/media URL parsing."""

from app.services.brand_context_service import (
    _is_usable_gallery_url,
    _normalize_gallery_url_key,
    _parse_reference_image_urls,
)


def test_parse_reference_image_urls_includes_api_media():
    raw = '["/api/media?key=d90862dc-55f5-4a23-9b8e-86d562671a48/image/2026/06/abc.jpg", "https://cdn.example.com/a.jpg"]'
    urls = _parse_reference_image_urls(raw)
    assert len(urls) == 2
    assert urls[0].startswith("/api/media")
    assert urls[1].startswith("https://")


def test_is_usable_gallery_url_api_media():
    assert _is_usable_gallery_url(
        "/api/media?key=tenant-uuid/image/2026/06/photo.webp"
    )
    assert not _is_usable_gallery_url("/api/media")
    assert not _is_usable_gallery_url("/api/media?key=bad.txt")


def test_normalize_gallery_url_key_uses_r2_object_key():
    a = "/api/media?key=tenant/image/2026/07/a.png"
    b = "/api/media?key=tenant/image/2026/07/b.png"
    assert _normalize_gallery_url_key(a) != _normalize_gallery_url_key(b)
    assert _normalize_gallery_url_key(a) == "tenant/image/2026/07/a.png"


def test_append_reference_image_urls_merges_without_dropping_existing():
    import asyncio
    import uuid

    from app.database import async_session_factory
    from app.services.brand_context_service import append_reference_image_urls

    tenant = uuid.uuid4()

    async def run() -> None:
        async with async_session_factory() as db:
            from app.services.brand_context_service import ensure_brand_context

            await ensure_brand_context(db, tenant, business_name="Merge Test")
            await db.commit()
        u1 = ["/api/media?key=tenant/image/2026/07/first.png"]
        u2 = ["/api/media?key=tenant/image/2026/07/second.png"]
        async with async_session_factory() as db:
            m1 = await append_reference_image_urls(db, tenant, u1)
            await db.commit()
            assert m1 == u1
        async with async_session_factory() as db:
            m2 = await append_reference_image_urls(db, tenant, u2)
            await db.commit()
            assert len(m2) == 2
            assert m2[0] == u2[0]
            assert m2[1] == u1[0]

    asyncio.run(run())
