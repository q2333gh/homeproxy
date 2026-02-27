---
name: phase2-cli-completion
overview: "Implement Phase 2 Go CLI features per docs/phase2_补全功能/phase2_补全功能.md: log clean, resources, acl, certificate, generator, and optional routing rules."
todos: []
isProject: false
---

# Phase 2 Go CLI 补全实现计划

**Goal:** Add the missing RPC-backed commands to the Go CLI as documented in [phase2_补全功能.md](docs/phase2_补全功能/phase2_补全功能.md).

**Architecture:** Each new feature calls `system.UBUSCall(system.RPCObject, method, params)`; no new system adapters. New commands follow the existing pattern: `main.go` switch case + dedicated `cmd/homeproxy/<command>.go`.

---

## Phase 2.1: 高优先级

### Task 1: `homeproxy log clean [type]`

- **Change:** Extend [cli-go/cmd/homeproxy/log.go](cli-go/cmd/homeproxy/log.go).
- **Logic:** If first arg is `clean`, call `ubus luci.homeproxy log_clean '{"type":"<t>"}'` where `t` is `homeproxy` (default), `sing-box-c`, or `sing-box-s`. Validate type.
- **Flow:** `logCommand(args)` → if args[0]=="clean", parse type from args[1] or default to "homeproxy", call `UBUSCall`, log result.

### Task 2: `homeproxy resources version [type]` and `resources update <type>`

- **New file:** [cli-go/cmd/homeproxy/resources.go](cli-go/cmd/homeproxy/resources.go).
- **Subcommands:**
  - `version [type]`: Call `resources_get_version`. If type omitted, show all four types (china_ip4, china_ip6, china_list, gfw_list).
  - `update <type>`: Call `resources_update`. Requires root. Valid types: china_ip4, china_ip6, china_list, gfw_list.
- **Wire:** Add `case "resources"` in [cli-go/cmd/homeproxy/main.go](cli-go/cmd/homeproxy/main.go), update usage.

---

## Phase 2.2: 中优先级

### Task 3: `homeproxy acl list <type>` and `acl write <type> --file <path>`

- **New file:** [cli-go/cmd/homeproxy/acl.go](cli-go/cmd/homeproxy/acl.go).
- **Subcommands:**
  - `list <type>`: Call `acllist_read`, print content. Valid types: direct_list, proxy_list.
  - `write <type> --file <path>`: Read file, call `acllist_write` with content. Requires root.
- **Wire:** Add `case "acl"` in main.go, update usage.

### Task 4: `homeproxy cert write <filename> --file <path>`

- **New file:** [cli-go/cmd/homeproxy/cert.go](cli-go/cmd/homeproxy/cert.go).
- **Logic:** Read user file, write to `/tmp/homeproxy_certificate.tmp`, call `certificate_write` with filename. Valid filenames: client_ca, server_publickey, server_privatekey.
- **Requires root** (tmp file + RPC).
- **Wire:** Add `case "cert"` in main.go, update usage.

---

## Phase 2.3: 低优先级

### Task 5: `homeproxy generator <type> [params]`

- **New file:** [cli-go/cmd/homeproxy/generator.go](cli-go/cmd/homeproxy/generator.go).
- **Subcommands:** uuid, reality-keypair, wg-keypair, vapid-keypair, ech-keypair.
- **Logic:** Call `singbox_generator` with type and optional params string; print result JSON or formatted output.
- **Wire:** Add `case "generator"` in main.go, update usage.

---

## Phase 2.4: 可选

### Task 6: `homeproxy routing rules`

- **Change:** Extend [cli-go/cmd/homeproxy/routing.go](cli-go/cmd/homeproxy/routing.go).
- **Logic:** Add `rules` action; read `homeproxy.routing.default_outbound`, `default_outbound_dns`, `sniff_override`; print summary.

---

## Implementation Order

1. log clean (smallest, extends existing file)
2. resources (new command, two subcommands)
3. acl (new command)
4. cert (new command)
5. generator (new command)
6. routing rules (optional, extends routing.go)

---

## Notes

- All RPC calls use [cli-go/internal/system/system.go](cli-go/internal/system/system.go) `UBUSCall(object, method, params)`.
- Root checks: `os.Geteuid() != 0` for write/update/clean operations where needed.
- Update [cli/install.sh](cli/install.sh) bash completion with new commands (acl, cert, generator, resources, log clean, routing rules).

