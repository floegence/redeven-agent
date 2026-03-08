import { Show, type Component, type JSX } from 'solid-js';
import { cn, useLayout } from '@floegence/floe-webapp-core';
import { ActivityBar, SidebarPane } from '@floegence/floe-webapp-core/layout';

export interface BrowserWorkspaceShellProps {
  title?: JSX.Element;
  width?: number;
  open?: boolean;
  resizable?: boolean;
  onResize?: (delta: number) => void;
  onClose?: () => void;
  onOpenSidebar?: () => void;
  bodyRef?: (el: HTMLDivElement) => void;
  modeSwitcher: JSX.Element;
  navigation?: JSX.Element;
  navigationLabel?: string;
  sidebarBody: JSX.Element;
  content: JSX.Element;
  headerActions?: JSX.Element;
  showSidebarToggle?: boolean;
  sidebarToggleLabel?: string;
  sidebarToggleIcon?: Component<{ class?: string }>;
  class?: string;
}

export function BrowserWorkspaceShell(props: BrowserWorkspaceShellProps) {
  const layout = useLayout();
  const showMobileActivityBar = () => Boolean(layout.isMobile() && props.showSidebarToggle && props.sidebarToggleIcon && props.onOpenSidebar);
  const sidebarActivityId = 'browser-sidebar';

  return (
    <div class={cn('relative flex h-full min-h-0 overflow-hidden bg-background', props.class)}>
      <Show when={showMobileActivityBar()}>
        <ActivityBar
          items={[
            {
              id: sidebarActivityId,
              icon: props.sidebarToggleIcon!,
              label: props.sidebarToggleLabel || 'Browser sidebar',
            },
          ]}
          activeId={sidebarActivityId}
          collapsed={props.open === false}
          onActiveChange={(_id, opts) => {
            if (opts?.openSidebar) {
              props.onOpenSidebar?.();
            }
          }}
          onCollapsedChange={(collapsed) => {
            if (collapsed) {
              props.onClose?.();
              return;
            }
            props.onOpenSidebar?.();
          }}
          class="z-[12]"
        />
      </Show>

      <SidebarPane
        title={props.title ?? 'Browser'}
        headerActions={props.headerActions}
        width={props.width}
        open={props.open}
        resizable={props.resizable}
        onResize={props.onResize}
        onClose={props.onClose}
        class={cn('h-full border-r border-border/70 bg-background', showMobileActivityBar() && 'relative z-[13]')}
        bodyClass="py-0"
        bodyRef={props.bodyRef}
      >
        <div class="flex h-full min-h-0 flex-col bg-background">
          <div class="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-background/95 px-2 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/90">
            <div class="space-y-2">
              <section>
                <div class="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">Mode</div>
                {props.modeSwitcher}
              </section>

              <Show when={props.navigation}>
                <section>
                  <div class="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">{props.navigationLabel || 'Navigate'}</div>
                  {props.navigation}
                </section>
              </Show>
            </div>
          </div>

          <div class="min-h-0 flex-1 px-2 py-2">
            <div class="h-full min-h-0 rounded-xl border border-border/60 bg-background p-1.5">
              {props.sidebarBody}
            </div>
          </div>
        </div>
      </SidebarPane>

      <div class="min-w-0 min-h-0 flex-1 bg-background">
        {props.content}
      </div>
    </div>
  );
}
