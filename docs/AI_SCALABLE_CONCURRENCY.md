# Flower: Scalable Multi-Thread Concurrency (Design)

Status: design proposal (not implemented).

This document proposes a **ground-up concurrency model** for Flower (Redeven Agent AI assistant) that is *natively prepared* for **many concurrent running threads** (no artificial thread-count cap).

It intentionally does **not** preserve backward compatibility with the current RPC semantics. The project is still in development; we optimize for a clean, auditable end state.

---

## 1. Problem Statement (Current Limitations)

Today, Flower cannot behave like a multi-thread parallel system because the agent enforces an implicit “one run per session channel” rule.

Concrete root causes in current code:

- **Channel-level mutual exclusion**: `Service.prepareRun` rejects any new run when `activeRunByChan[channel_id]` is set.
  - Impact: if one thread is running, **starting a run from any other thread in the same Env App session fails**.
- **Endpoint-wide realtime broadcast**: `SubscribeEndpoint` attaches an RPC stream server to an endpoint and can broadcast events for all threads to all subscribers.
  - Impact: with many active threads, background threads generate a **realtime event flood**.
- **UI “send = cancel + wait + restart” workaround**: the Env App cancels the previous run, waits, then starts a new run.
  - Impact: fragile UX, poor throughput, and not aligned with modern “steer” input patterns.

---

## 2. Goals

### 2.1 Functional

- **Many concurrent running threads** within the same endpoint.
- **At most one active run per thread** (thread-local consistency).
- **Enter-to-send uses “steer” semantics** (Codex-style):
  - if the thread has an active run, the new user input is **injected into that run**;
  - otherwise a new run is started.
- **Sidebar subscribes to summary only** (no transcript/stream deltas for non-active threads).
- **Active thread gets full fidelity** (transcript + lifecycle + tool blocks).

### 2.2 Non-functional

- No global “max threads” gate.
- No channel-level mutual exclusion.
- Concurrency control is defined strictly by:
  - per-thread invariants (one run per thread), and
  - resource scheduling (workspace writes, terminal processes, provider backpressure).

---

## 3. Non-goals

- Backward compatibility with existing `ai.subscribe` and `ai.startRun` behavior.
- Perfect realtime fidelity for background threads.
- Guaranteeing “true parallel execution” under external constraints (LLM provider 429, OS limits). We **never reject** on an arbitrary thread-count limit, but execution may naturally queue behind resource schedulers.

---

## 4. Key Concepts

### 4.1 Entities

- **Thread**: a conversation container.
- **Run**: an execution lifetime for a thread. A run may receive multiple user inputs (“steer inputs”) and produces assistant output and tool activity.
- **Steer input**: a user message added while a run is in-flight.

### 4.2 Concurrency invariants

- Invariant A: per `(endpoint_id, thread_id)` there is **at most one active run**.
- Invariant B: per endpoint there may be **many active runs**.
- Invariant C: mutating operations are serialized **by resource**, not by thread count.

---

## 5. End-State Architecture

The end state splits the current monolithic `ai.Service` responsibilities into orthogonal components.

### 5.1 Components

1) **AI API layer** (HTTP + RPC)

- Authz / RWX checks.
- Request validation.
- Delegation to orchestrator and event hub.

2) **ThreadManager + ThreadActor (per-thread actor model)**

- One lightweight actor per `(endpoint_id, thread_id)`.
- Serializes thread-local state transitions:
  - active run pointer,
  - thread run status,
  - steer routing,
  - cancel routing.

3) **RunSupervisor**

- Owns run lifecycle (spawn, cancel, done cleanup).
- Provides a run registry for `cancel/approval` by `run_id`.

4) **ResourceScheduler**

- Central, explicit resource scheduling.
- Coordinates:
  - workspace write locks,
  - terminal process pool,
  - provider backpressure.

5) **EventHub**

- Supports subscription scopes:
  - `summary(endpoint)`
  - `thread(endpoint, thread_id)`
  - (optional) `run(run_id)`
- Implements filtering and batching.

6) **PersistencePipeline**

- Moves best-effort and high-frequency writes off critical run paths.
- Uses a write-behind outbox + batch transactions for SQLite.

### 5.2 Why actors?

With many concurrent threads, a single global mutex becomes a scalability bottleneck and a correctness risk.

A per-thread actor model gives:

- deterministic thread-local sequencing,
- low contention across threads,
- explicit cancellation/steer ordering.

Actors are created on-demand and garbage-collected on idle timeout.

---

## 6. Protocol / API (End State)

### 6.1 RPC: `ai.sendUserTurn` (Codex-style start-or-steer)

This is the primary “Enter to send” endpoint.

Request:

- `thread_id`
- `model` (optional; if omitted, use thread model)
- `input`:
  - `message_id` (optional; client-generated optimistic id)
  - `text`
  - `attachments[]`
- `options`:
  - `max_steps`
  - `mode`
- `expected_run_id` (optional but recommended)

Behavior:

- If there is an active run for the thread:
  - If `expected_run_id` is present and does not match: return **409 conflict** (`run_changed`).
  - Otherwise: append the user input to transcript and **inject it into the active run** (“steer”).
  - Response includes the active `run_id`.
- If there is no active run:
  - Create a new run and start execution.
  - Response returns the new `run_id`.

This mirrors Codex core behavior:

- “attempt steer into active turn; if none, start a new turn/task”.

### 6.2 RPC: `ai.subscribeSummary`

- Scope: endpoint.
- Output: thread summary updates only.

Recommended event payload (example fields):

- `thread_id`
- `title`
- `updated_at_unix_ms`
- `last_message_preview`
- `last_message_at_unix_ms`
- `run_status`
- `run_error`
- `active_run_id` (optional)

No transcript message bodies and no stream deltas.

### 6.3 RPC: `ai.subscribeThread`

- Scope: `(endpoint_id, thread_id)`.
- Output: full fidelity for a single thread:
  - transcript messages (with row cursor),
  - lifecycle + tool blocks for the active run.

### 6.4 RPC: `ai.cancel`

- `cancel(run_id)` remains.
- `cancel(thread_id)` remains.

Cancel semantics do not require global locks.

### 6.5 RPC: `ai.approveTool`

Unchanged conceptually:

- approvals are tied to `run_id` and `tool_id`.
- approvals remain restricted to the run starter (to avoid cross-user confusion).

---

## 7. Event Model

### 7.1 Event scopes

- **Summary events** (endpoint scope)
  - low volume
  - batch/merge friendly
  - drive sidebar state

- **Thread events** (thread scope)
  - transcript messages
  - lifecycle phases
  - tool blocks

### 7.2 Event delivery rules

- Summary subscribers never receive:
  - transcript bodies
  - assistant delta frames

- Thread subscribers receive everything needed for the active UI thread.

### 7.3 Drop policy

- Summary events should be “last write wins” per thread.
- Thread delta frames may be dropped under load; the UI must self-heal by:
  - reloading transcript from persisted storage (existing gap backfill logic).

---

## 8. Run Steer: Runtime Semantics

### 8.1 Persist-first

Steer is always persisted as a transcript user message first:

- ensures UI durability,
- allows recovery after reconnect,
- makes steer idempotent by `message_id`.

### 8.2 In-memory injection

Each active run owns an in-memory steer queue:

- `steerCh` receives `SteerInput` items (message id + text + attachment refs + timestamp).

The runtime consumes steer inputs at safe boundaries:

- before each provider turn
- after each tool dispatch batch
- on “waiting_user” state transitions

### 8.3 If the run is blocked on tool approval

Recommended behavior:

- accept steer input and persist it immediately.
- keep the run in `waiting_approval`.
- the next model/tool decision after approval sees the new steer input.

Optional enhancement (future):

- if the user sends steer input while waiting approval, treat it as an implicit “do not proceed”, auto-cancel outstanding approvals, and re-plan.

---

## 9. Resource Scheduling (No Thread Count Cap)

The system must not serialize by “thread count”, but it must remain safe.

### 9.1 Workspace write lock

- Key: canonical working dir (thread working_dir).
- Read operations can be concurrent.
- Mutating operations acquire an exclusive lock.

Classification leverages existing tool risk/mutation detection:

- `apply_patch` is mutating.
- `terminal.exec` is mutating unless the command is classified `readonly`.

### 9.2 Terminal process pool

- Avoid OS overload.
- Queue, do not reject.

### 9.3 Provider backpressure

- Queue provider calls when hitting 429 / elevated latency.
- This is not a fixed “thread cap”; it is dynamic backpressure per provider.

---

## 10. Persistence Pipeline

SQLite is a shared bottleneck; high concurrency makes synchronous writes brittle.

End-state rules:

- **Critical writes** (must be durable):
  - transcript messages
  - thread run status updates
  - run records

- **Best-effort writes**:
  - noisy run events
  - assistant delta frames

Implementation sketch:

- an outbox channel per endpoint (or global) feeds a single writer goroutine.
- writer batches multiple events into one transaction.
- under load, drop or sample low-priority events.

---

## 11. Concrete Implementation Sketch (Pseudocode + Touch Points)

This section is intentionally concrete so the refactor is straightforward to execute.

### 11.1 ThreadActor: mailbox and state

Thread key:

- `thread_key = endpoint_id + \":\" + thread_id` (existing helper `runThreadKey(...)` already matches this idea).

Actor lifecycle:

- `ThreadManager.Get(thread_key)` returns an existing actor or creates one on demand.
- Each actor runs a single goroutine and processes a mailbox channel.
- Actors stop themselves after an idle timeout (no active run + no recent messages).

Minimal actor state:

- `active_run_id` (string)
- `active_run` (pointer/handle; only used for steer/cancel routing)
- cached thread summary fields (optional; for summary broadcast coalescing)

Mailbox commands (sketch):

```text
CmdSendUserTurn(meta, thread_id, expected_run_id?, model?, input, options) -> (run_id, kind=start|steer)
CmdCancel(run_id?|thread_id, reason) -> ok
CmdRunDone(run_id, final_status, final_error) -> void (clears active pointer if still current)
```

### 11.2 `sendUserTurn`: start-or-steer algorithm

This mirrors Codex core behavior: attempt steer into an active run first; if none exists, start a new run.

Pseudocode (thread actor perspective):

```text
on CmdSendUserTurn(req):
  assert thread exists

  if active_run_id != \"\":
    if req.expected_run_id != \"\" and req.expected_run_id != active_run_id:
      return 409 run_changed

    // Persist-first (idempotent by message_id uniqueness).
    persist_transcript_user_message(req.input)
    publish_thread_summary_update()
    publish_thread_transcript_message()

    // In-memory injection.
    active_run.enqueue_steer(req.input)
    publish_thread_stream_event(\"run.steer.accepted\")
    return (active_run_id, kind=steer)

  // No active run: start new.
  run_id = new_run_id()

  // Persist user message first (same as steer path).
  persist_transcript_user_message(req.input)
  persist_thread_run_state(thread_id, state=\"accepted\")
  publish_thread_summary_update()
  publish_thread_stream_event(\"run.accepted\")

  // Spawn the run asynchronously.
  active_run = RunSupervisor.StartRun(run_id, req.model, req.options, thread_id, ...)
  active_run_id = run_id

  persist_thread_run_state(thread_id, state=\"running\") // when actually entering execution
  publish_thread_summary_update()
  publish_thread_stream_event(\"run.started\")

  return (run_id, kind=start)
```

Notes:

- `message_id` should be required for steer-start idempotency. The existing `transcript_messages` uniqueness constraint (`UNIQUE(thread_id, message_id)`) already provides exactly-once behavior for retries.
- Use existing run states (`accepted` and `running`) instead of introducing a new `waiting_resource` state. The UI already treats `accepted` as active.

### 11.3 Run: steer queue and drain points

Add an in-memory steer queue to each run:

- `steerCh chan SteerInput` (buffered)
- `pendingSteer atomic/int` (optional; for diagnostics)

Drain points in the runtime loop:

- before each provider turn
- after each tool-dispatch batch
- when transitioning out of `waiting_user`

Drain behavior:

- convert steer inputs to normal “user messages” in the runtime `messages` buffer
- append attachment parts as `file` content messages (same encoding currently used in `buildMessagesForRun`)
- emit a lifecycle/stream event indicating steer was applied (optional but recommended for observability)

### 11.4 EventHub: subscription scopes and routing

Replace endpoint-wide broadcast with explicit subscription scopes:

- `summary_subs[endpoint_id] -> set(stream_server)`
- `thread_subs[endpoint_id:thread_id] -> set(stream_server)`

Routing rules:

- thread transcript and run stream events go only to `thread_subs[thread_key]`
- thread summary updates go only to `summary_subs[endpoint_id]`

Coalescing:

- summary updates should be “last write wins” per `(endpoint_id, thread_id)` to avoid floods during rapid transcript appends.

### 11.5 Concrete code touch points (current repo layout)

Server (Go):

- `internal/ai/service.go`
  - remove channel-level gate (`activeRunByChan`)
  - introduce ThreadManager/ThreadActor
  - implement `sendUserTurn` semantics
- `internal/ai/rpc.go`
  - add new RPC handlers: `sendUserTurn`, `subscribeSummary`, `subscribeThread`
- `internal/ai/realtime_sink.go`
  - implement scoped subscriptions and summary vs thread routing
- `internal/ai/run.go`, `internal/ai/native_runtime.go`
  - add steer queue and drain points

Env App UI (TypeScript):

- `internal/envapp/ui_src/src/ui/pages/AIChatContext.ts`
  - subscribe to summary only (drive sidebar)
  - keep `activeRunByThread` from summary updates
- `internal/envapp/ui_src/src/ui/pages/EnvAIPage.tsx`
  - Enter/send calls `sendUserTurn` (no cancel+wait)
  - active thread attaches `subscribeThread(thread_id)` and renders full events

Gateway (HTTP):

- `internal/codeapp/gateway/gateway.go`
  - remove any remaining channel-level “run already active” gating
  - keep thread-level busy checks only where they remain meaningful
---

## 12. Migration / Refactor Plan (Recommended Phases)

This is intentionally a refactor, not an incremental patch.

Phase 0: define end-state RPC types and UI subscription model.

Phase 1: remove channel-level mutual exclusion.

- delete `activeRunByChan` as a gating mechanism.
- enforce only per-thread active run.

Phase 2: implement `sendUserTurn` start-or-steer.

- server attempts steer first; if no active run, starts a new run.
- update Env App Enter flow to call `sendUserTurn`.
- delete UI cancel+wait workaround.

Phase 3: split subscriptions.

- summary subscribe drives sidebar.
- thread subscribe drives active thread.

Phase 4: introduce ResourceScheduler via tool interceptors.

Phase 5: move persistence to a pipeline.

---

## 13. Open Questions (Only if needed)

This design intentionally minimizes decision points. The only choices that may require product input later:

- Whether steer during `waiting_approval` should implicitly reject outstanding approvals.
- Whether to allow model switching mid-run (recommended: do not; keep model fixed per run).
