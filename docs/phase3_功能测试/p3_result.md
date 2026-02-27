
TDD tests for the Go CLI are implemented as planned. Verification: **all 14 tests pass** (13 in `cmd/homeproxy`, 1 in `internal/system`).

## Summary

### 1. Injectable command runner
- **`cli-go/internal/system/exec.go`**: Introduced `RunCommandImpl` that defaults to `execRunCommand`, so tests can inject a mock.
- **`cli-go/internal/system/system.go`**: Added `CheckInstalledFunc` so tests can bypass the config file check.

### 2. Mock runner
- **`cli-go/testutil/mock.go`**: Mock runner that returns LuCI API responses (`resources_get_version`, `acllist_read`, `singbox_get_features`, `singbox_generator`, `log_clean`, etc.) and records calls for contract checks.

### 3. Unit tests
- **`cli-go/cmd/homeproxy/main_test.go`**: Tests for help, status, features, resources version, acl list, generator uuid, and unknown command.
- **`cli-go/cmd/homeproxy/args_test.go`**: Tests for `parseFileFlag` and `containsString`.
- **`cli-go/internal/system/exec_test.go`**: Test for `runCommand` error handling (command not found).

### 4. Contract tests
- **`cli-go/cmd/homeproxy/main_test.go`**: Tests that `ubus` is called with the expected method and params for:
  - `resources version china_ip4` → `resources_get_version` with `type: china_ip4`
  - `acl list direct_list` → `acllist_read` with `type: direct_list`
  - `log clean sing-box-c` → `log_clean` with `type: sing-box-c`
  - `generator uuid` → `singbox_generator` with `type: uuid`

### 5. Documentation
- **`cli-go/TESTING.md`**: Documents `go test ./...` for unit/contract tests and optional `go test -tags=integration` for E2E.

**Run command:** `cd cli-go && go test ./...` (no root, uci, ubus, or OpenWrt).