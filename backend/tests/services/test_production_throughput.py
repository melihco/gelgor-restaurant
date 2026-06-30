from app.services.production_throughput import resolve_factory_drain_batch


def test_resolve_factory_drain_batch_uses_brand_override(monkeypatch) -> None:
    monkeypatch.setenv("PRODUCTION_FACTORY_DRAIN_BATCH", "2")
    theme = {"production_engines": {"throughput": {"factory_drain_batch": 5}}}

    assert resolve_factory_drain_batch(theme) == 5


def test_resolve_factory_drain_batch_accepts_camel_case_theme(monkeypatch) -> None:
    monkeypatch.setenv("PRODUCTION_FACTORY_DRAIN_BATCH", "2")
    theme = {"productionEngines": {"throughput": {"factory_drain_batch": 3}}}

    assert resolve_factory_drain_batch(theme) == 3


def test_resolve_factory_drain_batch_clamps_invalid_env(monkeypatch) -> None:
    monkeypatch.setenv("PRODUCTION_FACTORY_DRAIN_BATCH", "not-a-number")

    assert resolve_factory_drain_batch(None) == 1


def test_resolve_factory_drain_batch_clamps_range(monkeypatch) -> None:
    monkeypatch.setenv("PRODUCTION_FACTORY_DRAIN_BATCH", "99")

    assert resolve_factory_drain_batch({}) == 5
