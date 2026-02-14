// Shared data normalizers for AI chat blocks and page-level views.
// Extracted from EnvAIPage.tsx so that both aiBlockPresentation and EnvAIPage can share
// the same logic without circular dependencies.

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface ThreadTodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
  readonly note?: string;
}

export interface ThreadTodosView {
  readonly version: number;
  readonly updated_at_unix_ms: number;
  readonly todos: ThreadTodoItem[];
}

export function normalizeTodoStatus(raw: unknown): TodoStatus {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'in_progress' || value === 'completed' || value === 'cancelled') {
    return value;
  }
  return 'pending';
}

export function normalizeThreadTodosView(raw: unknown): ThreadTodosView {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const listRaw = Array.isArray(source.todos) ? source.todos : [];
  const todos: ThreadTodoItem[] = [];
  listRaw.forEach((entry, index) => {
    const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const content = String(item.content ?? '').trim();
    if (!content) return;
    const id = String(item.id ?? '').trim() || `todo_${index + 1}`;
    const note = String(item.note ?? '').trim();
    todos.push({
      id,
      content,
      status: normalizeTodoStatus(item.status),
      note: note || undefined,
    });
  });

  return {
    version: Math.max(0, Number(source.version ?? 0) || 0),
    updated_at_unix_ms: Math.max(0, Number(source.updated_at_unix_ms ?? 0) || 0),
    todos,
  };
}

export function todoStatusLabel(status: TodoStatus): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

export function todoStatusBadgeClass(status: TodoStatus): string {
  switch (status) {
    case 'in_progress':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'completed':
      return 'bg-success/10 text-success border-success/20';
    case 'cancelled':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
  }
}
