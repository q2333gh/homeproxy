---
name: qemu-openwrt-go-cli-wizard-tests
overview: Set up a QEMU-based OpenWrt VM to run the homeproxy Go CLI wizard tests end-to-end, including service=running verification, and document the procedure alongside existing phase8 verification docs.
todos:
  - id: pick-openwrt-image
    content: Select and document a specific OpenWrt/ImmortalWrt x86_64 image suitable for QEMU testing (with required packages).
    status: pending
  - id: define-qemu-run-cmd
    content: Define and document a reproducible qemu-system-x86_64 command with networking and port forwards for the OpenWrt VM.
    status: pending
  - id: install-homeproxy-in-vm
    content: Install homeproxy and dependencies in the QEMU OpenWrt VM and verify baseline status.
    status: pending
  - id: deploy-go-cli-into-vm
    content: Copy the built homeproxy Go CLI binary into the VM and decide on its path relative to the stock binary.
    status: pending
  - id: run-wizard-flow-in-vm
    content: Execute the full Web Wizard happy-path commands via Go CLI inside the VM, confirming service="running".
    status: pending
  - id: document-qemu-flow
    content: Write a new phase8 doc describing the QEMU-based wizard test flow and how it differs from the Docker/rootfs experiments.
    status: pending
isProject: false
---

### 1. Choose and prepare OpenWrt/ImmortalWrt QEMU image

- **Select image**: Use an x86_64 OpenWrt/ImmortalWrt image that already includes or can install `sing-box`, `firewall4`, `kmod-nft-tproxy`, `procd` and standard LuCI.
- **Download image**: Document exact URL and checksum of the chosen image in a new doc under `docs/phase8_run_go-cli_agent_verification/` (for reproducibility).
- **Disk layout**: Decide whether to use the prebuilt qcow2/combined image or convert raw image to qcow2; ensure there is writable overlay space for `uci commit` and package installs.

### 2. Define QEMU run command and networking

- **QEMU command**: Define a reusable `qemu-system-x86_64` invocation with:
  - Sufficient RAM/CPU (e.g. 1–2 vCPU, 256–512 MB RAM).
  - The downloaded OpenWrt disk image as `-drive`.
  - A simple network config (e.g. user-mode with host port forwards or a TAP bridge) so the host can SSH/HTTP into OpenWrt.
- **Port forwards**: Expose at least:
  - SSH (e.g. host `localhost:2222` → guest 22) for file copy and CLI execution.
  - Optional LuCI HTTP port if you want to compare Web Wizard visually.
- **Boot verification**: Describe how to confirm the VM booted successfully (e.g. watch console, then SSH in once the system is reachable).

### 3. Install homeproxy and dependencies inside the VM

- **Package install**:
  - Use `opkg update` and `opkg install` to install `homeproxy` and `luci-app-homeproxy` from the appropriate feed, or copy and install the `.ipk` built by `.github/build-ipk.sh`.
  - Ensure `sing-box`, `firewall4`, `kmod-nft-tproxy`, and `ucode` modules are present; document the minimal package set.
- **Verify baseline**:
  - Confirm `/etc/config/homeproxy`, `/etc/homeproxy`, `/etc/init.d/homeproxy` all exist and are from the installed package (not just from your git tree).
  - Run `uci show homeproxy`, `/etc/init.d/homeproxy status`, and a bare `homeproxy status` to confirm environment sanity.

### 4. Deploy Go CLI binary into the VM

- **Build on host**: From `cli-go`, run `go build -o bin/homeproxy ./cmd/homeproxy` on the host (outside the VM).
- **Copy into VM**: Use `scp` (over the QEMU forwarded SSH port) to copy `cli-go/bin/homeproxy` into the VM (e.g. `/usr/local/bin/homeproxy-cli` to avoid clobbering the LuCI binary).
- **PATH and separation**:
  - Decide whether to replace the stock `/usr/bin/homeproxy` or keep both (e.g. `/usr/bin/homeproxy` from opkg, `/usr/local/bin/homeproxy-cli` from Go CLI).
  - Prefer the second approach and document that tests will use `/usr/local/bin/homeproxy-cli` explicitly.

### 5. Re-run phase8 Go CLI tests inside the QEMU VM

- **Unit/contract tests**:
  - Option A: copy the `cli-go` source tree into the VM and run `go test ./...` there to verify the toolchain inside the VM.
  - Option B (lighter): rely on the host-side `go test ./...` already documented in `go-cli-docker-go-test.md` and skip in-VM unit tests.
- **Wizard only**:
  - At minimum, ensure the VM has the Go CLI binary and run the wizard-flow commands from `llm-agent-test-plan.md` using `/usr/local/bin/homeproxy-cli`.

### 6. Execute full Wizard "happy path" with Go CLI in QEMU

- **Initial state collection**:
  - Run and record: `homeproxy-cli status --json`, `routing get --json`, `dns get --json`, `subscription list --json`, mirroring the table in `llm-agent-test-plan.md` and `go-cli-openwrt-wizard-flow.md`.
- **Subscription setup**:
  - Use a **HTTP/HTTPS** subscription URL that your upstream actually supports (not `hy2://`), via `homeproxy-cli subscription add <url>` and `subscription update`.
  - Confirm new nodes via `homeproxy-cli node list --json`.
- **Node and routing**:
  - Select a suitable node from JSON and run `homeproxy-cli node set-main <label-or-id>`.
  - If necessary, adjust routing mode with `homeproxy-cli routing set ...` (but ideally keep defaults to match Web Wizard docs).
- **DNS**:
  - Optionally adjust DNS configuration with `homeproxy-cli dns set ...` to match your real-world preferences, or leave defaults.
- **Start service and verify**:
  - Run `homeproxy-cli control start`.
  - Then run `homeproxy-cli status --json` and confirm `**service` becomes `"running"`** and `main_node` matches the chosen node.
  - Optionally run `homeproxy-cli node test` to confirm external connectivity.

### 7. Capture logs and map to existing docs

- **Record commands and outputs**:
  - Capture the exact CLI commands and key JSON outputs that represent each step of the Web Wizard flow.
  - Note any deviations from the earlier Docker/rootfs experiments (e.g. `service` now correctly reports `running`).
- **Correlate with docs**:
  - For each step, cross-reference the relevant sections in:
    - `docs/phase6_user_guide_IMPORTANT/z_web_wizard_examaple.md`
    - `docs/phase8_run_go-cli_agent_verification/llm-agent-test-plan.md`
    - `docs/phase8_run_go-cli_agent_verification/go-cli-openwrt-wizard-flow.md`
  - Identify where behavior in a full QEMU VM differs from the minimal rootfs Docker tests (especially around init/procd/sing-box).

### 8. Document the QEMU flow as a new phase8 doc

- **New doc file**:
  - Add a dedicated document, e.g. `docs/phase8_run_go-cli_agent_verification/go-cli-qemu-openwrt-wizard-flow.md`.
  - Summarize:
    - QEMU image choice and QEMU run command.
    - One concrete example session of the full Wizard path with Go CLI in the VM.
    - Screenshots/log snippets only where they add value, focusing on JSON snapshots of key states.
- **Positioning**:
  - Clarify that this QEMU-based procedure is the **closest automated approximation of a real router** and should be the reference for validating `service="running"` and full end-to-end behavior of the Go CLI Wizard.

