import type { ProxyRuntime } from "@floegence/flowersec-core/proxy";
import { disableUpstreamServiceWorkerRegister, installWebSocketPatch } from "@floegence/flowersec-core/proxy";

// This script is injected into code-server HTML responses by our custom Service Worker.
// It MUST be an external script (no inline) to satisfy code-server's strict CSP.

const RUNTIME_GLOBAL = "__flowersecProxyRuntime";

function getProxyRuntime(): ProxyRuntime | null {
  const top = window.top as unknown as Record<string, unknown> | null;
  if (!top) return null;
  const rt = top[RUNTIME_GLOBAL];
  if (!rt) return null;
  return rt as ProxyRuntime;
}

try {
  const rt = getProxyRuntime();
  if (rt) {
    // Prevent upstream pages from registering their own Service Workers and stealing the scope.
    disableUpstreamServiceWorkerRegister();

    // Route same-origin WebSocket connections through flowersec-proxy/ws streams.
    installWebSocketPatch({ runtime: rt });
  }
} catch {
  // Best-effort: failing to patch should not break the page render.
}

