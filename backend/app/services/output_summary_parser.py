from __future__ import annotations

import json
from typing import Any


def strip_markdown_code_fences(text: str) -> str:
    return text.strip().replace("\r\n", "\n").removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def _filter_object_items(items: list[Any]) -> list[dict[str, Any]]:
    return [item for item in items if isinstance(item, dict)]


def _scan_json_array_candidates(text: str) -> list[list[dict[str, Any]]]:
    candidates: list[list[dict[str, Any]]] = []
    search_from = 0

    while True:
        first_bracket = text.find("[", search_from)
        if first_bracket == -1:
            break

        depth = 0
        in_str = False
        escape = False
        end = -1

        for i in range(first_bracket, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == "\\" and in_str:
                escape = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end = i
                    break

        if end == -1:
            break

        try:
            parsed = json.loads(text[first_bracket:end + 1])
            if isinstance(parsed, list):
                objects = _filter_object_items(parsed)
                if objects:
                    candidates.append(objects)
        except Exception:
            pass

        search_from = end + 1

    return candidates


def _scan_json_object_candidates(text: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    search_from = 0

    while True:
        first_brace = text.find("{", search_from)
        if first_brace == -1:
            break

        depth = 0
        in_str = False
        escape = False
        end = -1

        for i in range(first_brace, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == "\\" and in_str:
                escape = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break

        if end == -1:
            break

        try:
            parsed = json.loads(text[first_brace:end + 1])
            if isinstance(parsed, dict):
                candidates.append(parsed)
        except Exception:
            pass

        search_from = end + 1

    return candidates


def _recover_truncated_array_objects(text: str) -> list[dict[str, Any]]:
    """Recover complete top-level objects from a truncated JSON array (no closing `]`)."""
    first_bracket = text.find("[")
    if first_bracket == -1:
        return []

    objects: list[dict[str, Any]] = []
    depth = 0
    in_str = False
    escape = False
    obj_start = -1

    for i in range(first_bracket + 1, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_str:
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start != -1:
                try:
                    parsed = json.loads(text[obj_start:i + 1])
                    if isinstance(parsed, dict):
                        objects.append(parsed)
                except Exception:
                    pass
                obj_start = -1

    return objects


def extract_object_array_from_output_summary(
    output_summary: str | None,
    root_array_keys: tuple[str, ...] = ("ideas", "content_ideas", "contentIdeas"),
) -> list[dict[str, Any]]:
    if not output_summary or len(output_summary.strip()) < 2:
        return []

    clean = strip_markdown_code_fences(output_summary)

    try:
        parsed = json.loads(clean)
        if isinstance(parsed, list):
            return _filter_object_items(parsed)
        if isinstance(parsed, dict):
            for key in root_array_keys:
                value = parsed.get(key)
                if isinstance(value, list):
                    objects = _filter_object_items(value)
                    if objects:
                        return objects
    except Exception:
        pass

    candidates = _scan_json_array_candidates(clean)
    if candidates:
        return max(candidates, key=len)

    # Truncated arrays (progress API / display caps) — recover complete objects.
    recovered = _recover_truncated_array_objects(clean)
    if recovered:
        return recovered

    return []


def extract_structured_payload_from_output_summary(
    output_summary: str | None,
    root_array_keys: tuple[str, ...] = ("ideas", "content_ideas", "contentIdeas"),
) -> dict[str, Any] | list[dict[str, Any]] | None:
    if not output_summary or len(output_summary.strip()) < 2:
        return None

    clean = strip_markdown_code_fences(output_summary)

    try:
        parsed = json.loads(clean)
        if isinstance(parsed, list):
            objects = _filter_object_items(parsed)
            return objects or None
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    arrays = _scan_json_array_candidates(clean)
    if arrays:
        for arr in sorted(arrays, key=len, reverse=True):
            if arr:
                return arr

    objects = _scan_json_object_candidates(clean)
    if objects:
        for obj in objects:
            for key in root_array_keys:
                value = obj.get(key)
                if isinstance(value, list):
                    items = _filter_object_items(value)
                    if items:
                        return items
            return obj

    return None
