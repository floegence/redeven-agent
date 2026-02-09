# Redeven Agent

Redeven Agent is the **endpoint** in the Redeven + Flowersec E2EE architecture.

- Control-plane: the agent connects to Region Center via **Flowersec direct** (`/control/ws`, no tunnel).
- Data-plane: the agent receives `grant_server` over the control channel, then attaches to a **Flowersec tunnel server** as `role=server` and serves encrypted RPC/streams.

This repository is intended to be **open-sourced** so users can audit what runs on their machines.

## Status

Implemented in this repo:

- `floe_app = com.floegence.redeven.agent`
  - File system RPC (list/read/write/delete/get_home) + `fs/read_file` stream
  - Terminal RPC (create/list/attach) + bidirectional data notifications
  - Monitor RPC (CPU/network/process snapshot)
  - Agent-bundled Env App UI assets: `internal/envapp/ui_src/` -> `internal/envapp/ui/dist/`
  - Optional: Env App AI Agent (TS sidecar + Go tool executor). Documentation: [`docs/AI_AGENT.md`](docs/AI_AGENT.md)
  - Documentation: [`docs/ENV_APP.md`](docs/ENV_APP.md)
- `floe_app = com.floegence.redeven.code`
  - code-server over Flowersec E2EE proxy (`flowersec-proxy/http1`, `flowersec-proxy/ws`)
  - Agent-bundled UI assets (CSP-safe inject script): `internal/codeapp/ui_src/` -> `internal/codeapp/ui/dist/`
  - Documentation: [`docs/CODE_APP.md`](docs/CODE_APP.md)

Not implemented yet (planned):

- `floe_app = ...` (rebrowser, 3rd-party apps, etc)

- Release process and artifact verification: [`docs/RELEASE.md`](docs/RELEASE.md)

## Install Distribution and Cloudflare Delivery

- Installer source: `scripts/install.sh` (this repo)
- Release mirror workflow: `.github/workflows/sync-release-assets-to-r2.yml`
- Sync script: `scripts/sync_release_assets_to_r2.sh`
- Install worker source template: `deployment/cloudflare/workers/install-agent/generate-worker.js`
- Install worker config: `deployment/cloudflare/workers/install-agent/wrangler.toml`
- Cloudflare production branch for install worker: `release`

Delivery model:

- GitHub Release is the single source of truth for binaries and checksum files.
- On `release: published`, GitHub Actions mirrors release assets to Cloudflare R2 (`agent.package.example.invalid/agent-install-pkg/<tag>/...`) and updates `version.agent.example.invalid/v1/manifest.json`.
- Manifest is updated only after mirror verification succeeds.
- `install.sh` keeps GitHub as primary download source and Cloudflare as fallback.
- `main` merges do not deploy the install worker. Use `./scripts/publish_install_worker_release_branch.sh <tag>` only when installer/worker sources change.

See release operations: [`docs/RELEASE.md`](docs/RELEASE.md).

## Build

Requirements:

- Go `1.25.7`
- Node.js `20` (to build embedded UI/sidecar assets)
- npm (comes with Node.js)
- pnpm (or Node.js `corepack`)

Build:

```bash
./scripts/build_assets.sh
go build -o redeven ./cmd/redeven
```

Note: `internal/**/dist/` are generated build artifacts (embedded via Go `embed`) and are not checked into git.

## Quick start

1) Bootstrap (exchange env token for direct control-channel credentials):

```bash
./redeven bootstrap \
  --controlplane https://<region>.<base-domain> \
  --env-id <env_public_id> \
  --env-token <env_token>
```

This writes a local config file (default: `~/.redeven/config.json`).
By default, the local permission cap is `execute_read_write`. You can override it via `--permission-policy`.

2) Run:

```bash
./redeven run
```

## Security notes

- The config file contains secrets (PSK). Keep it private (`chmod 600`).
- The agent **does not** trust browser-claimed permissions; it only trusts `session_meta` delivered by Region Center over the direct control channel.
- Capability-to-permission mapping (what each permission enables): [`docs/CAPABILITY_PERMISSIONS.md`](docs/CAPABILITY_PERMISSIONS.md).
- Local permission cap (`permission_policy`): [`docs/PERMISSION_POLICY.md`](docs/PERMISSION_POLICY.md).

## FS path model

FS RPC paths use a **virtual root**:

- `/` is the agent's configured filesystem root directory.
- All FS requests/responses use POSIX-like absolute paths (e.g. `/projects/app`).
