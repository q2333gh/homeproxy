#!/usr/bin/env python3
"""Shared helpers for whitelist GitOps scripts."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

HIGH_RISK_DOMAINS = {
    "google.com",
    "youtube.com",
    "googleapis.com",
    "gstatic.com",
    "gmail.com",
}

DOMAIN_RE = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$"
)


def read_text_utf8(path: Path) -> str:
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise ValueError(f"File not found: {path}") from exc
    if not data:
        return ""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"File must be valid UTF-8: {path}") from exc
    return text


def ensure_trailing_newline(path: Path, text: str) -> None:
    if text and not text.endswith("\n"):
        raise ValueError(f"File must end with a newline: {path}")


def normalize_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        s = raw.strip().lower()
        if not s or s.startswith("#"):
            continue
        lines.append(s)
    return lines


def load_normalized_lines(path: Path) -> list[str]:
    text = read_text_utf8(path)
    ensure_trailing_newline(path, text)
    return normalize_lines(text)


def validate_domains(lines: Iterable[str]) -> list[str]:
    invalid: list[str] = []
    for line in lines:
        if not DOMAIN_RE.match(line):
            invalid.append(line)
    return invalid


def find_duplicates(lines: Iterable[str]) -> list[str]:
    seen = set()
    dups = set()
    for line in lines:
        if line in seen:
            dups.add(line)
        else:
            seen.add(line)
    return sorted(dups)


def find_high_risk(lines: Iterable[str]) -> list[str]:
    hits = set()
    for line in lines:
        for dom in HIGH_RISK_DOMAINS:
            if line == dom or line.endswith("." + dom):
                hits.add(line)
    return sorted(hits)

