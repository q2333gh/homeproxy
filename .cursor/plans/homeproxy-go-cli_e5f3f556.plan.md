---
name: homeproxy-go-cli
overview: Replace the current shell-based HomeProxy CLI with a Go implementation that preserves core commands, simplifies architecture, and interacts with UCI/init.d/ubus in a clean, maintainable way.
todos:
  - id: setup-go-cli-skeleton
    content: Create Go module and main CLI entry (command routing, help text, basic argument parsing).
    status: completed
  - id: implement-system-adapters
    content: Implement thin Go wrappers around uci, /etc/init.d/homeproxy, and ubus for installation checks, config read/write, and service control.
    status: completed
  - id: port-status-control-log
    content: Port status, control, and log commands from the shell CLI into Go using the new adapters.
    status: completed
  - id: port-node-commands
    content: Reimplement node list/test/set-main/add/remove/edit/import/export in Go, fixing naming/UX issues noted in docs/refac_v1.md.
    status: completed
  - id: port-routing-dns-commands
    content: Reimplement routing and DNS commands in Go, omitting or redesigning any half-baked rule features.
    status: completed
  - id: port-subscription-commands
    content: Reimplement subscription management commands in Go using UCI and the existing update script, only exposing fully supported subcommands.
    status: completed
  - id: wire-installation-and-migration
    content: Integrate the Go binary into the install process, optionally keep a thin shell wrapper during migration, and ensure docs are updated to describe the new CLI.
    status: completed
isProject: false
---

# HomeProxy Go CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing shell-based HomeProxy CLI with a Go-based CLI that offers the same core functionality (status, node, routing, DNS, subscription, control, logs, features), is easy to read/maintain, and aligns with the first-principles refactoring notes in `docs/refac_v1.md`.

**Architecture:** Implement a single `homeproxy` Go binary with a clear command tree mirroring the current UX, backed by small internal packages for UCI/config, service control, and LuCI RPC. For v1, interact with the system via `os/exec` calls to `uci`, `/etc/init.d/homeproxy`, and `ubus`, keeping logic explicit and simple; avoid premature abstractions or half-implemented features.

**Tech Stack:** Go (with or without `spf13/cobra` for CLI), OpenWrt tools (`uci`, `ubus`, `/etc/init.d/homeproxy`), existing HomeProxy config and RPC API as documented in `docs/api-reference.md` and `docs/cli-enhancement-plan.md`.

---

### High-Level Design

- **Command surface (keep, but clean):**
  - `homeproxy status`
  - `homeproxy node list|test|set-main|add|remove|edit|import|export`
  - `homeproxy routing get|set|set-node|status` (omit half-baked `rules` for now)
  - `homeproxy dns get|set|set-china|test|cache|strategy|status`
  - `homeproxy subscription list|add|remove|update|auto-update|filter|status` (only implement filter actions that can be done cleanly)
  - `homeproxy control start|stop|restart|status`
  - `homeproxy log [type]`
  - `homeproxy features`
- **Integration strategy:**
  - Phase 1: Implement new Go binary side-by-side with existing shell CLI; keep `.sh` as a thin wrapper or alternative entry until Go path is stable.
  - Phase 2 (later): Make Go binary the primary `homeproxy` CLI and retire shell implementation.
- **System interactions:**
  - UCI: shell out to `uci show/get/set/add/delete/add_list/commit` for `homeproxy` config (`/etc/config/homeproxy`).
  - Service: shell out to `/etc/init.d/homeproxy start|stop|restart|reload|status`.
  - RPC: shell out to `ubus call luci.homeproxy ...` for `connection_check`, `singbox_get_features`, `resources_`*, etc., reusing patterns from `docs/api-reference.md`.

---

### Plan Steps

#### 1. Go module & CLI skeleton

- Create a new Go module under something like `cli-go/` or `cmd/homeproxy/` with `go.mod` and a minimal `main.go`.
- Choose a CLI approach:
  - Either: use `spf13/cobra` for structured subcommands matching the existing command tree.
  - Or: implement a light custom parser (arguments switch) if you prefer zero external deps.
- Implement top-level command routing: `homeproxy <command> <subcommand> [args...]`, with `--help` mirroring current `cli/homeproxy` usage text in `cli/homeproxy`.

#### 2. Core system adapters (UCI, service, RPC)

- Add an internal package (e.g., `internal/system` or `internal/homeproxy`) that exposes small, explicit functions:
  - `CheckInstalled() error` (verify `/etc/config/homeproxy` exists, as in `etc/homeproxy.conf`).
  - `ServiceStatus()`, `ServiceStart()`, `ServiceStop()`, `ServiceRestart()`, `ServiceReload()` using `/etc/init.d/homeproxy`.
  - `UCIGet(path)`, `UCISet(path, value)`, `UCICommit(pkg)`, etc., wrapping `uci` with clear error messages.
  - `UBUSCall(object, method, paramsJSON)` for calls like `luci.homeproxy connection_check` and `singbox_get_features`.
- Make these adapters very thin (no heavy generic abstraction), to keep failure modes easy to reason about and logs simple.

#### 3. Implement `status`, `control`, and `log` commands

- Port `show_status`, `service_control`, and `show_log` behavior from `cli/homeproxy` into Go:
  - `status` should print service running state, main node label, routing mode, and sing-box version via `ubus` (as in current shell).
  - `control` should call the service helpers and log human-friendly messages.
  - `log` should read from `/var/run/homeproxy/<type>.log` and show the last N lines (use a default similar to `DEFAULT_LOG_LINES` in `cli/etc/homeproxy.conf`).
- Use a consistent output style (no JSON in v1 unless clearly needed), focusing on readable, aligned text.

#### 4. Node management in Go

- Mirror the semantics of `cli/lib/node.sh` in Go, but fix the confusing bits noted in `docs/refac_v1.md`:
  - `node list`: read all `config homeproxy 'node'` sections via `uci show homeproxy` and print label/address/port/type, marking the main node from `homeproxy.config.main_node`.
  - `node test [name]`: resolve node by section name or label (like `find_node_by_name`), then run `connection_check` via `ubus` for `google` and `baidu` and print PASS/FAIL.
  - `node set-main <name>`: update `homeproxy.config.main_node` and reload service.
  - `node add/remove/edit/import/export`: reimplement only the behaviors you truly want to support, avoiding pseudo-names like `node_$(date +%s)`; rely on a stable key (e.g., label or explicit `name` field) so user-visible names always work across commands.
- Keep validation helpers (`validate_port`, etc.) simple and local to the Go code instead of copying every shell helper 1:1.

#### 5. Routing and DNS commands

- `routing get/set/set-node/status`:
  - Implement `get` and `status` by reading `homeproxy.config.routing_mode`, `routing_port`, `proxy_mode`, and relevant node references.
  - Implement `set` with strict validation (modes listed in `docs/api-reference.md` and `docs/refac_v1.md`), then UCI commit + reload.
  - Implement `set-node` for `main` and `udp` types using the same node resolution logic as `node set-main`.
  - Defer or remove `rules`/`rule add` style commands until you design a clear UCI mapping.
- `dns get/set/set-china/test/cache/strategy/status`:
  - Port behaviors from `cli/lib/dns.sh`, reading/writing `homeproxy.config.dns_server`, `homeproxy.config.china_dns_server`, and `homeproxy.dns.`*.
  - Use `nslookup`/`dig` via `os/exec` for `dns test` when available, with clear error messages if tools are missing.

#### 6. Subscription commands

- Implement `subscription list/add/remove/update/auto-update/filter/status` in Go using the same UCI fields (`homeproxy.subscription.`*) as `cli/lib/subscription.sh`:
  - `list`/`status`: list subscription URLs, filter keywords, auto-update flags, and related settings.
  - `add`/`remove`: manage `subscription_url` list, carefully reconstructing lists to avoid UCI quirks.
  - `update`: shell out to `/etc/homeproxy/scripts/update_subscriptions.uc` if present, then optionally reuse the Go `node list` implementation to show imported nodes.
  - `auto-update` and `filter`: only implement sub-commands that you can do fully and correctly; avoid partial stubs.

#### 7. Wiring, packaging, and migration

- Decide on directory placement inside the repo (e.g., `cli-go/` or `cmd/homeproxy/`) and adjust `cli/install.sh` later to install the Go binary into `/usr/bin/homeproxy`.
- (Optional, transitional) Keep the existing shell `cli/homeproxy` as a very thin wrapper that just execs the Go binary, to preserve entry-point compatibility while migrating.
- Ensure that `docs/api-reference.md` and `docs/cli-enhancement-plan.md` are still accurate after the Go CLI is in place; add a short CLI usage section if necessary.

---

### Notes and Assumptions

- Final implementation language is Go; `.sh` is considered legacy and should not gain new logic.
- v1 focuses on core, frequently used commands; any stubby/half-implemented features in the current shell CLI should be either fully designed or temporarily removed from the public command surface.
- System interactions remain via external commands (`uci`, `ubus`, `/etc/init.d/homeproxy`) to keep dependencies and complexity low on OpenWrt devices; deeper integrations (e.g., `libuci`) can be a future phase.

