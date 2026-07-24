"""Unit tests for schema gate mode resolution (no DB)."""

from app.services.schema_gate import resolve_schema_gate_mode


def test_resolve_mode_explicit_fail():
    assert resolve_schema_gate_mode(configured="fail", is_development=True) == "fail"


def test_resolve_mode_dev_defaults_warn():
    assert resolve_schema_gate_mode(configured="", is_development=True) == "warn"


def test_resolve_mode_prod_defaults_fail():
    assert resolve_schema_gate_mode(configured=None, is_development=False) == "fail"


def test_resolve_mode_off():
    assert resolve_schema_gate_mode(configured="off", is_development=False) == "off"
