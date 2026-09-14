"""Same quality verdict twice → no third paint (credits), different verdict → retry."""

from app.services.production_job_service import (
    is_repeated_quality_verdict,
    quality_verdict_marker,
)


def test_marker_detects_quality_verdicts_only() -> None:
    assert quality_verdict_marker("quality_hard_block: Tasarım kalitesi onay için yeterli değil") == "quality_hard_block"
    assert quality_verdict_marker("caption_design_incoherent (yazı, foto ve başlık)") == "caption_design_incoherent"
    assert quality_verdict_marker("Bakış yapılamadı (bakış çağrısı)") is None
    assert quality_verdict_marker(None) is None


def test_same_verdict_twice_is_repeat() -> None:
    prev = "caption_design_incoherent: yazı, foto ve başlık uyuşmuyor"
    new = "caption_design_incoherent: yazı, foto ve başlık uyuşmuyor (attempt 2)"
    assert is_repeated_quality_verdict(prev, new) is True


def test_different_verdict_or_non_quality_previous_is_not_repeat() -> None:
    assert is_repeated_quality_verdict("Bakış yapılamadı", "quality_hard_block") is False
    assert is_repeated_quality_verdict("caption_design_incoherent", "quality_hard_block") is False
    assert is_repeated_quality_verdict(None, "quality_hard_block") is False
    # Non-quality errors never become terminal through this rule.
    assert is_repeated_quality_verdict("provider timeout", "provider timeout") is False
