# Capability-to-Permission Mapping

This document defines a stable mapping from **agent capabilities** to **permission categories**.

It is intentionally public and reviewable: users should be able to audit what each permission enables.

Scope:
- Flowersec **RPC** (typed RPC `type_id`s)
- Flowersec **streams** (Yamux stream `kind`s)
- Agent local **HTTP gateway APIs** under `/_redeven_proxy/api/*`

## Permission Categories

- `read`
  - Non-destructive access (filesystem reads, safe queries, list endpoints).
  - May create/update **agent-local metadata** used by the UI (e.g. AI threads, uploads), but must not mutate the **workspace filesystem** or execute commands.
- `write`
  - Workspace filesystem mutations (write/delete/rename/copy) and destructive deletes of agent-local data.
  - High risk and should be explicitly enabled.
- `execute`
  - Command execution, interactive sessions, and network-forwarding style capabilities.
  - High risk and should be explicitly enabled.
- `admin`
  - Management actions (codespace management, settings updates, agent maintenance operations, audit log access).
  - This is the namespace-level `admin` bit delivered by Region Center in `session_meta`.

Notes:
- `write` does NOT imply `execute`, and vice versa.
- `execute=true` does NOT mean "read-only": terminal commands can still mutate files even when `write=false`. For strict read-only, require `write=false` **and** `execute=false`.
- `admin` is a separate capability dimension from RWX.
- UIs should treat permission denials as a normal capability state (not an exceptional error): when a capability is not granted (or is locally capped by `permission_policy`), stop polling and show a permission empty state.

## Effective Permissions (Control-Plane Grant ∩ Endpoint Local Cap)

Redeven agents enforce permissions from two sources:

1) Control-plane: `session_meta` delivered by Region Center (authoritative grant).
2) Endpoint local: `permission_policy` in the agent config (authoritative cap).

The agent must always compute:

```
cap_rwx = permission_policy.local_max
if by_user[user_public_id] exists: cap_rwx = cap_rwx ∩ by_user[user_public_id]
if by_app[floe_app] exists: cap_rwx = cap_rwx ∩ by_app[floe_app]

effective_rwx = session_meta.rwx ∩ cap_rwx
effective_admin = session_meta.can_admin  // NOTE: not clamped by permission_policy
```

See also: [`PERMISSION_POLICY.md`](PERMISSION_POLICY.md).

## Data-Plane Capabilities

### RPC (Yamux stream kind: `rpc`)

| Domain | Capability | RPC type_id | Required permission | Source |
| --- | --- | ---: | --- | --- |
| FS | Get home | `1010` | `read` | `internal/fs/service.go` |
| FS | List directory | `1001` | `read` | `internal/fs/service.go` |
| FS | Read file (JSON) | `1002` | `read` | `internal/fs/service.go` |
| FS | Write file | `1003` | `write` | `internal/fs/service.go` |
| FS | Rename (file/dir) | `1004` | `write` | `internal/fs/service.go` |
| FS | Copy (file/dir) | `1005` | `write` | `internal/fs/service.go` |
| FS | Delete (file/dir) | `1006` | `write` | `internal/fs/service.go` |
| Terminal | Create session | `2001` | `execute` | `internal/terminal/manager.go` |
| Terminal | List sessions | `2002` | `execute` | `internal/terminal/manager.go` |
| Terminal | Attach session | `2003` | `execute` | `internal/terminal/manager.go` |
| Terminal | Output notify | `2004` | `execute` | `internal/terminal/manager.go` |
| Terminal | Resize notify | `2005` | `execute` | `internal/terminal/manager.go` |
| Terminal | Input notify | `2006` | `execute` | `internal/terminal/manager.go` |
| Terminal | History | `2007` | `execute` | `internal/terminal/manager.go` |
| Terminal | Clear | `2008` | `execute` | `internal/terminal/manager.go` |
| Terminal | Delete session | `2009` | `execute` | `internal/terminal/manager.go` |
| Terminal | Name update notify | `2010` | `execute` | `internal/terminal/manager.go` |
| Terminal | Session stats | `2011` | `execute` | `internal/terminal/manager.go` |
| Terminal | Sessions changed notify | `2012` | `execute` | `internal/terminal/manager.go` |
| Monitor | System monitor snapshot | `3001` | `execute` | `internal/monitor/service.go` |
| Sys | Ping | `4001` | `none (session required)` | `internal/sys/service.go` |
| Sys | Upgrade | `4002` | `admin` | `internal/sys/service.go` |
| Sys | Restart | `4003` | `admin` | `internal/sys/service.go` |
| Sessions | List active sessions | `5001` | `read` | `internal/agent/sessions_rpc.go` |

Design notes:
- Terminal "list/history" are classified as `execute` to avoid subtle privilege splits ("can observe but not control") under the current RWX model.
- If we ever need finer-grained terminal controls, we should introduce new permission dimensions instead of overloading `read/write/execute`.

### Streams (Yamux stream kind != `rpc`)

| Stream kind | Session (floe_app / code_space_id) | Purpose | Required permission | Source |
| --- | --- | --- | --- | --- |
| `fs/read_file` | any | Read raw file bytes (preview/download) | `read` | `internal/fs/stream_read_file.go` |
| `flowersec-proxy/http1` | `com.floegence.redeven.code` | HTTP proxy (code-server) | `read + write + execute` | `internal/agent/agent.go` |
| `flowersec-proxy/ws` | `com.floegence.redeven.code` | WebSocket proxy (code-server) | `read + write + execute` | `internal/agent/agent.go` |
| `flowersec-proxy/http1` | `com.floegence.redeven.portforward` | HTTP proxy (arbitrary reachable target) | `execute` | `internal/agent/agent.go` |
| `flowersec-proxy/ws` | `com.floegence.redeven.portforward` | WebSocket proxy (arbitrary reachable target) | `execute` | `internal/agent/agent.go` |
| `flowersec-proxy/http1` | `com.floegence.redeven.agent` + `code_space_id="env-ui"` | Env App UI static assets (runtime mode) | `none (session required)` | `internal/agent/agent.go` |

Notes:
- Proxy streams are enabled per-session. The same stream kind can require different permissions depending on `session_meta.floe_app` (and sometimes `code_space_id`).
- Code App is intentionally conservative: the agent requires **all three** permission bits (`read`, `write`, `execute`) before it will serve `floe_app = com.floegence.redeven.code` (to avoid misleading "read-only code-server" semantics).

## Local Gateway HTTP API Capabilities (`/_redeven_proxy/api/*`)

These endpoints are served by the agent local gateway and delivered to the browser over Flowersec E2EE proxy.

Permissions are enforced by checking effective `session_meta` bits (see `internal/codeapp/gateway/gateway.go`).

| Endpoint | Purpose | Required permission | Source |
| --- | --- | --- | --- |
| `GET /_redeven_proxy/api/audit/logs` | Agent-local audit logs | `admin` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/settings` | Read agent settings | `read` | `internal/codeapp/gateway/gateway.go` |
| `PUT /_redeven_proxy/api/settings` | Update agent settings | `admin` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/spaces` | List codespaces | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/spaces` | Create codespace | `admin` | `internal/codeapp/gateway/gateway.go` |
| `PATCH /_redeven_proxy/api/spaces/:code_space_id` | Rename/update codespace metadata | `admin` | `internal/codeapp/gateway/gateway.go` |
| `DELETE /_redeven_proxy/api/spaces/:code_space_id` | Delete codespace config | `admin` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/spaces/:code_space_id/start` | Start code-server for a codespace | `execute` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/spaces/:code_space_id/stop` | Stop code-server for a codespace | `execute` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/forwards` | List port forwards | `execute` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/forwards` | Create port forward | `execute` | `internal/codeapp/gateway/gateway.go` |
| `PATCH /_redeven_proxy/api/forwards/:forward_id` | Update port forward | `execute` | `internal/codeapp/gateway/gateway.go` |
| `DELETE /_redeven_proxy/api/forwards/:forward_id` | Delete port forward | `execute` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/forwards/:forward_id/touch` | Mark a port forward as opened (UI/audit) | `execute` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/ai/models` | List allowed AI models | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/runs` | Start an AI run (streaming) | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/runs/:run_id/cancel` | Cancel an AI run | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/runs/:run_id/tool_approvals` | Approve/reject a tool call | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/uploads` | Upload an attachment | `read` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/ai/uploads/:upload_id` | Download an attachment | `read` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/ai/threads` | List AI threads | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/threads` | Create AI thread | `read` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/ai/threads/:thread_id` | Get AI thread | `read` | `internal/codeapp/gateway/gateway.go` |
| `PATCH /_redeven_proxy/api/ai/threads/:thread_id` | Rename AI thread | `read` | `internal/codeapp/gateway/gateway.go` |
| `DELETE /_redeven_proxy/api/ai/threads/:thread_id` | Delete AI thread | `write` | `internal/codeapp/gateway/gateway.go` |
| `GET /_redeven_proxy/api/ai/threads/:thread_id/messages` | List AI thread messages | `read` | `internal/codeapp/gateway/gateway.go` |
| `POST /_redeven_proxy/api/ai/threads/:thread_id/messages` | Append AI thread message | `read` | `internal/codeapp/gateway/gateway.go` |

## Adding New Capabilities (Policy Contract)

When introducing a new RPC type, stream kind, or gateway API:
1) Add it to this document with an explicit permission category.
2) Enforce the permission in code at the handler entry.
3) Add a unit test that demonstrates deny/allow behavior.

Changes to this mapping are **security-sensitive** and must be reviewed carefully.
