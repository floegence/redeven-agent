export type MaintenanceKind = 'upgrade' | 'restart';

export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return String(err.message || '').trim();
  if (typeof err === 'string') return String(err).trim();
  return '';
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function formatAgentStatusLabel(raw: string | null | undefined): string {
  const status = String(raw ?? '').trim().toLowerCase();
  if (!status || status === 'unknown') return 'Unknown';
  if (status === 'online') return 'Online';
  if (status === 'offline') return 'Offline';
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}
