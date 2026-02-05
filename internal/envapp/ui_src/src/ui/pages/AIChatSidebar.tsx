import { For, Show } from 'solid-js';
import { MessageSquare, Plus } from '@floegence/floe-webapp-core/icons';
import { SnakeLoader } from '@floegence/floe-webapp-core/loading';
import { SidebarContent, SidebarSection, SidebarItem, SidebarItemList } from '@floegence/floe-webapp-core/layout';
import { Button, Tooltip } from '@floegence/floe-webapp-core/ui';
import { useProtocol } from '@floegence/floe-webapp-protocol';
import { useAIChatContext } from './AIChatContext';

// Format a unix-ms timestamp as a relative time string.
function fmtRelativeTime(ms: number): string {
  if (!ms) return 'Never';
  try {
    const now = Date.now();
    const diff = now - ms;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  } catch {
    return String(ms);
  }
}

/**
 * AI chat thread list rendered in Shell's native sidebar.
 * Uses standard floe-webapp SidebarContent / SidebarSection / SidebarItem.
 */
export function AIChatSidebar() {
  const ctx = useAIChatContext();
  const protocol = useProtocol();

  return (
    <SidebarContent>
      <SidebarSection
        title="AI Chats"
        actions={
          <Tooltip content="New chat" placement="bottom" delay={0}>
            <Button
              size="icon"
              variant="ghost"
              icon={Plus}
              onClick={() => void ctx.createNewChat()}
              disabled={ctx.creatingThread() || protocol.status() !== 'connected'}
              class="w-6 h-6"
              aria-label="New chat"
            />
          </Tooltip>
        }
      >
        <Show
          when={!ctx.threads.loading}
          fallback={
            <div class="px-2.5 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <SnakeLoader size="sm" />
              <span>Loading chats...</span>
            </div>
          }
        >
          <Show
            when={!ctx.threads.error}
            fallback={
              <div class="px-2.5 py-2 text-xs text-error">
                {ctx.threads.error instanceof Error ? ctx.threads.error.message : String(ctx.threads.error)}
              </div>
            }
          >
            <Show
              when={(ctx.threads()?.threads?.length ?? 0) > 0}
              fallback={
                <div class="px-2.5 py-4 text-xs text-muted-foreground text-center">
                  <MessageSquare class="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <div>No chats yet</div>
                  <div class="mt-1 text-[11px]">Start a new conversation</div>
                </div>
              }
            >
              <SidebarItemList>
                <For each={ctx.threads()?.threads ?? []}>
                  {(t) => (
                    <SidebarItem
                      icon={<MessageSquare class="w-4 h-4" />}
                      active={t.thread_id === ctx.activeThreadId()}
                      onClick={() => ctx.setActiveThreadId(t.thread_id)}
                    >
                      <div class="flex flex-col gap-0.5 min-w-0 w-full">
                        <div class="flex items-center justify-between gap-2">
                          <span class="truncate">{t.title?.trim() || 'New chat'}</span>
                          <span class="text-[10px] text-muted-foreground shrink-0">{fmtRelativeTime(t.updated_at_unix_ms)}</span>
                        </div>
                        <Show when={!!t.last_message_preview?.trim()}>
                          <span class="text-[11px] text-muted-foreground/70 truncate">{t.last_message_preview}</span>
                        </Show>
                      </div>
                    </SidebarItem>
                  )}
                </For>
              </SidebarItemList>
            </Show>
          </Show>
        </Show>
      </SidebarSection>
    </SidebarContent>
  );
}
