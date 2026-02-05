# Permission Policy (Local Cap)

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

The local cap is designed to protect users from:
- accidental misconfiguration,
- overly-broad grants,
- and (in the worst case) compromised control-plane behavior.

Notes:
- The local cap only applies to `read/write/execute` (RWX).
- `can_admin` is a separate namespace-level capability bit delivered by Region Center in `session_meta`.

## Config Schema

`~/.redeven-agent/config.json`:

```json
{
  "permission_policy": {
    "schema_version": 1,
    "local_max": {
      "read": true,
      "write": false,
      "execute": true
    },
    "by_user": {
      "user_xxx": { "read": true, "write": false, "execute": false }
    },
    "by_app": {
      "com.floegence.redeven.agent": { "read": true, "write": false, "execute": true }
    }
  }
}
```

Notes:
- `schema_version` and `local_max` are required when `permission_policy` exists.
- Unknown fields must be ignored for forward compatibility.

## Defaults

If `permission_policy` is missing, the recommended default local cap is:

- `execute = true`
- `read = true`
- `write = false`

Rationale:
- Terminal requires `execute` and is the core feature.
- File browsing requires `read` and should work out of the box.
- Filesystem mutations are high risk and should be explicitly enabled.

Security note:
- `write=false` only disables FS write-style RPCs (and some destructive gateway actions). If `execute=true`, terminal commands can still mutate files. Use the `read_only` preset for strict read-only (`execute=false, read=true, write=false`).

## Bootstrap CLI

`redeven-agent bootstrap` can write `permission_policy` into the config file.

Recommended usage (presets):

```bash
redeven-agent bootstrap ... --permission-policy execute_read
redeven-agent bootstrap ... --permission-policy read_only
redeven-agent bootstrap ... --permission-policy execute_read_write
```

Preset meaning:
- `execute_read` (default): `execute=true, read=true, write=false`
- `read_only`: `execute=false, read=true, write=false`
- `execute_read_write`: `execute=true, read=true, write=true`

## Relation to Capabilities

For a complete list of RPC/stream capabilities and their required permission category, see:

- [`CAPABILITY_PERMISSIONS.md`](CAPABILITY_PERMISSIONS.md)
