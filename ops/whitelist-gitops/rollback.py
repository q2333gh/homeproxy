#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


TARGET_PATH = "ops/whitelist-gitops/direct_list.txt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rollback whitelist by git ref.")
    parser.add_argument("git_ref")
    parser.add_argument("router_host")
    parser.add_argument("user")
    parser.add_argument("password_or_env")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent

    show = subprocess.run(
        ["git", "show", f"{args.git_ref}:{TARGET_PATH}"],
        text=True,
        capture_output=True,
    )
    if show.returncode != 0:
        print(
            f"[ERROR] Cannot read {TARGET_PATH} from git ref: {args.git_ref}",
            file=sys.stderr,
        )
        return 1

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as temp_file:
        temp_file.write(show.stdout)
        temp_path = temp_file.name

    deploy_cmd = [
        sys.executable,
        str(script_dir / "deploy.py"),
        args.router_host,
        args.user,
        args.password_or_env,
        "--file",
        temp_path,
    ]
    if args.force:
        deploy_cmd.append("--force")

    print(f"[INFO] rollback source: {args.git_ref}:{TARGET_PATH}")
    try:
        proc = subprocess.run(deploy_cmd)
        if proc.returncode != 0:
            return proc.returncode
    finally:
        Path(temp_path).unlink(missing_ok=True)

    print(f"[OK] rollback completed to {args.git_ref}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

