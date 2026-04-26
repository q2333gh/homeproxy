#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from whitelist_common import load_normalized_lines


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy whitelist to OpenWrt router.")
    parser.add_argument("router_host")
    parser.add_argument("user")
    parser.add_argument("password_or_env")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--file", default=None, help="Whitelist file path")
    return parser.parse_args()


@dataclass(frozen=True)
class RouterTarget:
    host: str
    user: str
    password: str

    @property
    def endpoint(self) -> str:
        return f"{self.user}@{self.host}"

    @property
    def ssh_base(self) -> list[str]:
        return ["sshpass", "-p", self.password]


def run(cmd: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        check=check,
        text=True,
        capture_output=capture,
    )


def resolve_password(password_or_env: str) -> str:
    if password_or_env == "env":
        passwd = os.getenv("ROUTER_PASS", "")
        if not passwd:
            raise ValueError("ROUTER_PASS is empty")
        return passwd
    return password_or_env


def run_validator(script_dir: Path, file_path: Path, force: bool) -> None:
    validate_cmd = [
        sys.executable,
        str(script_dir / "validate.py"),
        "--file",
        str(file_path),
    ]
    if force:
        validate_cmd.append("--force")
    run(validate_cmd)


def apply_remote_whitelist(target: RouterTarget, local_file: str, remote_file: str) -> None:
    ssh_opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null"]
    try:
        run(target.ssh_base + ["scp", *ssh_opts, local_file, f"{target.endpoint}:{remote_file}"])
    except subprocess.CalledProcessError:
        # Some OpenWrt images miss sftp-server, so scp may fail. Fall back to ssh+cat upload.
        with open(local_file, "rb") as src:
            subprocess.run(
                target.ssh_base
                + ["ssh", *ssh_opts, target.endpoint, f"cat > '{remote_file}'"],
                check=True,
                stdin=src,
            )
    remote_cmd = (
        "set -e; "
        "command -v homeproxy >/dev/null 2>&1 || { echo '[ERROR] homeproxy CLI not found'; exit 10; }; "
        f"homeproxy acl write direct_list --file '{remote_file}'; "
        "homeproxy control reload >/dev/null 2>&1 || /etc/init.d/homeproxy reload >/dev/null 2>&1"
    )
    run(target.ssh_base + ["ssh", *ssh_opts, target.endpoint, remote_cmd])


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    file_path = Path(args.file) if args.file else script_dir / "direct_list.txt"

    try:
        router_pass = resolve_password(args.password_or_env)
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2

    run_validator(script_dir, file_path, args.force)

    normalized = sorted(set(load_normalized_lines(file_path)))
    entry_count = len(normalized)
    remote_file = "/tmp/homeproxy_gitops_direct_list.txt"
    target = RouterTarget(host=args.router_host, user=args.user, password=router_pass)

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as tf:
        tmp_name = tf.name
        if normalized:
            tf.write("\n".join(normalized) + "\n")

    try:
        apply_remote_whitelist(target, tmp_name, remote_file)
    finally:
        Path(tmp_name).unlink(missing_ok=True)

    print("[OK] whitelist deployed")
    print(f"[INFO] target: {target.endpoint}")
    print(f"[INFO] file: {file_path}")
    print(f"[INFO] applied_entries: {entry_count}")
    print("[INFO] mode: CLI-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

