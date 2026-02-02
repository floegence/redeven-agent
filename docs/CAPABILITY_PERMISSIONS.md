# Capability-to-Permission Mapping

This document defines a stable mapping from **agent capabilities** (RPC `type_id`s and stream `kind`s) to **permission categories** (`read`, `write`, `execute`).

It is intentionally public and reviewable: users should be able to audit what each permission enables.

## Permission Categories

- `read`
  - Read-only access to the agent filesystem (e.g. list, read file).
  - Must not mutate the filesystem.
- `write`
  - Mutating filesystem operations (e.g. write, delete, rename).
  - This is high risk and should be explicitly enabled.
- `execute`
  - Command execution and interactive sessions (terminal).
  - This is high risk and should be explicitly enabled.

Notes:
- `write` does NOT imply `execute`, and vice versa.
- In Redeven, **effective permissions** MUST always be the intersection of:
  - `session_meta` granted by Region Center (authoritative on the control-plane), and
  - the agent's local `permission_policy` cap (authoritative on the endpoint; resolved from `local_max` with optional `by_user` / `by_app` overrides).
- See also: [`PERMISSION_POLICY.md`](PERMISSION_POLICY.md).

## Data-Plane Capabilities

### RPC (Yamux stream kind: `rpc`)

| Domain | Capability | RPC type_id | Required permission | Source |
| --- | --- | ---: | --- | --- |
| FS | Get home | `1010` | `read` | `internal/fs/service.go` |
| FS | List directory | `1001` | `read` | `internal/fs/service.go` |
| FS | Read file (JSON) | `1002` | `read` | `internal/fs/service.go` |
| FS | Write file | `1003` | `write` | `internal/fs/service.go` |
| FS | Delete (file/dir) | `1006` | `write` | `internal/fs/service.go` |
| Terminal | Create session | `2001` | `execute` | `internal/terminal/manager.go` |
| Terminal | List sessions | `2002` | `execute` | `internal/terminal/manager.go` |
| Terminal | Attach session | `2003` | `execute` | `internal/terminal/manager.go` |
| Terminal | Output notify | `2004` | `execute` | `internal/terminal/manager.go` |
| Terminal | Resize notify | `2005` | `execute` | `internal/terminal/manager.go` |
| Terminal | Input notify | `2006` | `execute` | `internal/terminal/manager.go` |
| Terminal | History | `2007` | `execute` | `internal/terminal/manager.go` |
| Terminal | Clear | `2008` | `execute` | `internal/terminal/manager.go` |

Design note:
- Terminal "list/history" are classified as `execute` to avoid subtle privilege splits ("can observe but not control") under the current 3-bit model. If we ever need finer-grained terminal controls, we should introduce new permission dimensions instead of overloading `read/write/execute`.

### Streams (Yamux stream kind != `rpc`)

| Stream kind | Purpose | Required permission | Source |
| --- | --- | --- | --- |
| `fs/read_file` | Read raw file bytes (preview/download) | `read` | `internal/fs/stream_read_file.go` |
| `flowersec-proxy/http1` | HTTP proxy (Code App) | `read + write + execute` | `internal/agent/agent.go` |
| `flowersec-proxy/ws` | WebSocket proxy (Code App) | `read + write + execute` | `internal/agent/agent.go` |

Notes for Code App:
- The code-server UI effectively enables a full interactive environment. For MVP, the agent requires **all three** permission bits (`read`, `write`, `execute`) before it will serve `floe_app = com.floegence.redeven.code`.
- This is intentionally conservative to avoid misleading "read-only code-server" semantics.

## Adding New Capabilities (Policy Contract)

When introducing a new RPC type or stream kind:
1) Add it to this table with an explicit permission category.
2) Enforce the permission in code at the handler entry.
3) Add a unit test that demonstrates deny/allow behavior.

Changes to this mapping are **security-sensitive** and must be reviewed carefully.
