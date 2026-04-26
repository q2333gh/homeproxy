#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from whitelist_common import (
    find_duplicates,
    find_high_risk,
    load_normalized_lines,
    validate_domains,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate HomeProxy direct whitelist file."
    )
    parser.add_argument("--file", default=None, help="Whitelist file path")
    parser.add_argument(
        "--force", action="store_true", help="Allow high-risk domains"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    file_path = Path(args.file) if args.file else script_dir / "direct_list.txt"

    try:
        lines = load_normalized_lines(file_path)
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    if not lines:
        print(f"[WARN] No active whitelist entries in {file_path}")

    invalid = validate_domains(lines)
    if invalid:
        print("[ERROR] Invalid domain entries detected:")
        for line in invalid:
            print(f"  - {line}")
        return 1

    dups = find_duplicates(lines)
    if dups:
        print("[ERROR] Duplicate domains detected:")
        for line in dups:
            print(f"  - {line}")
        return 1

    high_risk = find_high_risk(lines)
    if high_risk and not args.force:
        print("[ERROR] High-risk domains detected. Use --force to continue:")
        for line in high_risk:
            print(f"  - {line}")
        return 1

    print("[OK] whitelist validation passed")
    print(f"[INFO] file: {file_path}")
    print(f"[INFO] active entries: {len(lines)}")
    if high_risk:
        print("[WARN] high-risk entries allowed by --force")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

