---
name: tdd-go-cli-tests
overview: Add TDD tests for the Go CLI that verify correctness against the LuCI API contract, using mocked exec/ubus/uci to avoid modifying the host (no apply, no singbox, no routing changes). Optional Docker integration for full E2E.
todos: []
isProject: false
---

# TDD Tests for Go CLI Correctness

**Goal:** Add tests that verify the Go CLI behaves correctly according to the LuCI API contract in [docs/api-reference.md](docs/api-reference.md) and [root/usr/share/rpcd/ucode/luci.homeproxy](root/usr/share/rpcd/ucode/luci.homeproxy), without modifying the host (no apply, no singbox, no routing, no UCI writes).

**Constraint:** All tests must run with `go test` without requiring root, uci, ubus, or OpenWrt. Use mocks/stubs; optionally Docker for E2E.

---

## 1. Architecture: Injectable Command Runner

The CLI calls [internal/system/system.go](cli-go/internal/system/system.go) which uses `runCommand` in [internal/system/exec.go](cli-go/internal/system/exec.go). To test without touching the host, inject a mock runner.

**Option A (recommended):** Use a package-level var in `internal/system`:

```go
// exec.go
var runCommandImpl = execRunCommand

func runCommand(name string, args ...string) (string, error) {
    return runCommandImpl(name, args...)
}

func execRunCommand(name string, args ...string) (string, error) {
    cmd := exec.Command(name, args...)
    // ... existing logic
}
```

In tests, set `system.runCommandImpl = mockRunCommand` before each test (use `defer` to restore). The mock returns predefined responses based on `name` and `args`, matching the LuCI API contract.

**Option B:** Extract an `Execer` interface and pass it to system functions. More invasive.

---

## 2. Test Layout

```
cli-go/
├── internal/system/
│   └── exec_test.go        # Test runCommand error handling (no mock needed for basic tests)
├── cmd/homeproxy/
│   └── main_test.go        # Or split: status_test.go, node_test.go, etc.
├── testutil/
│   └── mock.go             # Mock runner that returns LuCI API contract responses
```

---

## 3. Test Categories

### 3.1 Unit Tests (always run, no host)

| Command / Behavior                                                              | What to Test              | Mock Response                                |
| ------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| `help`, `status`, `features`, `resources version`, `acl list`, `generator uuid` | Output format, no panic   | Mock ubus/uci to return LuCI API JSON        |
| `CheckInstalled`                                                                | Error when config missing | Mock `os.Stat` or skip (use build tag)       |
| `parseFileFlag`, `containsString`                                               | Arg parsing               | No mock; pure function tests                 |
| Invalid args                                                                    | Usage error messages      | No mock for parsing; mock for CheckInstalled |

### 3.2 Contract Tests (verify API usage)

Verify that the CLI invokes ubus/uci with params that match the LuCI API:

| CLI Invocation                | Expected ubus/uci Call                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| `resources version china_ip4` | `ubus call luci.homeproxy resources_get_version '{"type":"china_ip4"}'`    |
| `acl list direct_list`        | `ubus call luci.homeproxy acllist_read '{"type":"direct_list"}'`           |
| `log clean sing-box-c`        | `ubus call luci.homeproxy log_clean '{"type":"sing-box-c"}'`               |
| `generator uuid`              | `ubus call luci.homeproxy singbox_generator '{"type":"uuid","params":""}'` |

**Implementation:** In mock runner, record `(name, args)` for each call. In tests, assert the recorded calls match the expected ubus/uci invocations from [api-reference.md](docs/api-reference.md).

### 3.3 Skip / No-Apply Tests

Commands that would modify host state are tested **only with mocks** (no real uci/ubus/init.d):

- `control start/stop/restart` – mock init.d; never run real
- `node add/remove/set-main` – mock uci; never run real
- `routing set/set-node` – mock uci
- `dns set/set-china/cache/strategy` – mock uci
- `subscription add/remove/update/auto-update/filter` – mock uci
- `log clean` – mock ubus
- `resources update` – mock ubus
- `acl write` – mock ubus
- `cert write` – mock ubus + os.ReadFile/WriteFile (or mock file ops)

---

## 4. Mock Responses (LuCI API Contract)

From [api-reference.md](docs/api-reference.md) and `luci.homeproxy`:

| RPC                        | Mock Response                                                |
| -------------------------- | ------------------------------------------------------------ |
| `resources_get_version`    | `{"version":"2024-01-01","error":null}`                      |
| `resources_update`         | `{"status":0}`                                               |
| `acllist_read`             | `{"content":"# direct list\n","error":""}`                   |
| `connection_check`         | `{"result":true}`                                            |
| `singbox_get_features`     | `{"version":"1.9.0","with_quic":true}`                       |
| `singbox_generator` (uuid) | `{"result":{"uuid":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}}` |
| `log_clean`                | `{"result":true}`                                            |

UCI `show` / `get` mocks return minimal valid UCI output for homeproxy sections (config, node, routing, dns, subscription).

---

## 5. Docker Option (Optional E2E)

For full integration against real uci/ubus:

- Use `immortalwrt/immortalwrt` or similar OpenWrt base image
- Install homeproxy + uci + ubus in container
- Copy CLI binary into container; run read-only commands: `status`, `features`, `resources version`, `acl list`, `generator uuid`
- Skip write commands (or use container-only UCI, safe to modify)

Mark E2E tests with build tag `//go:build integration` or `-short` skip, so `go test` runs only unit/contract tests by default.

---

## 6. Implementation Order

1. Add `runCommandImpl` indirection in [exec.go](cli-go/internal/system/exec.go).
2. Create [testutil/mock.go](cli-go/testutil/mock.go) with mock runner and LuCI contract responses.
3. Add [cmd/homeproxy/main_test.go](cli-go/cmd/homeproxy/main_test.go) (or per-command files): unit tests for help, status, features, resources version, acl list, generator uuid.
4. Add contract tests: assert mock was called with correct ubus/uci args.
5. Add tests for parseFileFlag, containsString in [args_test.go](cli-go/cmd/homeproxy/args_test.go).
6. Document `go test` (unit only) vs `go test -tags=integration` (Docker E2E, if implemented).

---

## 7. Run Command

```bash
cd cli-go && go test ./...
```

No sudo, no uci, no ubus, no host changes. All assertions are against the LuCI API contract.
