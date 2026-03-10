import { Show } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';
import { History, Refresh } from '@floegence/floe-webapp-core/icons';
import { Button } from '@floegence/floe-webapp-core/ui';
import type {
  GitBranchSummary,
  GitCommitSummary,
  GitListBranchesResponse,
  GitListWorkspaceChangesResponse,
  GitRepoSummaryResponse,
  GitResolveRepoResponse,
  GitWorkspaceChange,
  GitWorkspaceSection,
} from '../protocol/redeven_v1';
import { repoDisplayName, summarizePendingWorkspaceCount, summarizeWorkspaceCount, syncStatusLabel, type GitBranchSubview, type GitWorkbenchSubview } from '../utils/gitWorkbench';
import { GitChangesPanel } from './GitChangesPanel';
import { GitBranchesPanel } from './GitBranchesPanel';
import { GitHistoryBrowser } from './GitHistoryBrowser';
import { gitSubviewTone, gitToneActionButtonClass, gitToneDotClass } from './GitChrome';
import { GitMetaPill } from './GitWorkbenchPrimitives';

export interface GitWorkbenchProps {
  repoInfo?: GitResolveRepoResponse | null;
  repoInfoLoading?: boolean;
  currentPath: string;
  subview: GitWorkbenchSubview;
  repoSummary?: GitRepoSummaryResponse | null;
  repoSummaryLoading?: boolean;
  repoSummaryError?: string;
  workspace?: GitListWorkspaceChangesResponse | null;
  workspaceLoading?: boolean;
  workspaceError?: string;
  selectedWorkspaceSection?: GitWorkspaceSection;
  onSelectWorkspaceSection?: (section: GitWorkspaceSection) => void;
  selectedWorkspaceItem?: GitWorkspaceChange | null;
  onSelectWorkspaceItem?: (item: GitWorkspaceChange) => void;
  busyWorkspaceKey?: string;
  busyWorkspaceAction?: 'stage' | 'unstage' | '';
  branches?: GitListBranchesResponse | null;
  branchesLoading?: boolean;
  branchesError?: string;
  selectedBranch?: GitBranchSummary | null;
  selectedBranchSubview?: GitBranchSubview;
  onSelectBranchSubview?: (view: GitBranchSubview) => void;
  commits?: GitCommitSummary[];
  listLoading?: boolean;
  listLoadingMore?: boolean;
  listError?: string;
  hasMore?: boolean;
  selectedCommitHash?: string;
  onSelectCommit?: (hash: string) => void;
  onLoadMore?: () => void;
  commitMessage?: string;
  commitBusy?: boolean;
  onCommitMessageChange?: (value: string) => void;
  onCommit?: (message: string) => void;
  onStageSelected?: (item: GitWorkspaceChange) => void;
  onUnstageSelected?: (item: GitWorkspaceChange) => void;
  onBulkAction?: (section: GitWorkspaceSection) => void;
  showMobileSidebarButton?: boolean;
  onToggleSidebar?: () => void;
  onRefresh?: () => void;
  class?: string;
}

function subviewLabel(view: GitWorkbenchSubview): string {
  switch (view) {
    case 'changes':
      return 'Changes';
    case 'branches':
      return 'Branches';
    case 'history':
      return 'Graph';
    default:
      return 'Changes';
  }
}

function normalizeSubview(view: GitWorkbenchSubview): GitWorkbenchSubview {
  return view === 'overview' ? 'changes' : view;
}

export function GitWorkbench(props: GitWorkbenchProps) {
  const repoLabel = () => repoDisplayName(props.repoSummary?.repoRootPath || props.repoInfo?.repoRootPath || props.currentPath);
  const repoPath = () => String(props.repoSummary?.repoRootPath || props.repoInfo?.repoRootPath || props.currentPath || '/').trim() || '/';
  const changeCount = () => summarizeWorkspaceCount(props.workspace?.summary ?? props.repoSummary?.workspaceSummary);
  const pendingCount = () => summarizePendingWorkspaceCount(props.workspace?.summary ?? props.repoSummary?.workspaceSummary);
  const headRef = () => String(props.repoSummary?.headRef || props.repoInfo?.headRef || '').trim();
  const loadingBusy = () => Boolean(props.repoInfoLoading || props.repoSummaryLoading || props.workspaceLoading || props.branchesLoading);
  const activeSubview = () => normalizeSubview(props.subview);
  const subviewTone = () => gitSubviewTone(activeSubview());

  return (
    <div class={cn('relative flex h-full min-h-0 flex-col bg-background', props.class)}>
      <div class="shrink-0 border-b border-border/45 bg-background/95 px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class={cn('h-2 w-2 shrink-0 rounded-full', gitToneDotClass(subviewTone()))} aria-hidden="true" />
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{subviewLabel(activeSubview())}</div>
              <GitMetaPill tone={subviewTone()}>{headRef() || 'Detached HEAD'}</GitMetaPill>
              <GitMetaPill tone={changeCount() > 0 ? 'warning' : 'success'}>
                {changeCount() > 0 ? `${changeCount()} changes` : 'Clean workspace'}
              </GitMetaPill>
              <Show when={pendingCount() > 0}>
                <GitMetaPill tone="warning">{pendingCount()} pending</GitMetaPill>
              </Show>
            </div>
            <div class="mt-2 max-w-full truncate text-base font-semibold tracking-tight text-foreground">{repoLabel()}</div>
            <div class="mt-1 max-w-full truncate text-[11px] text-muted-foreground">{repoPath()}</div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Show when={props.repoSummary && (props.repoSummary.aheadCount || props.repoSummary.behindCount)}>
              <GitMetaPill tone="info">{syncStatusLabel(props.repoSummary?.aheadCount, props.repoSummary?.behindCount)}</GitMetaPill>
            </Show>
            <Show when={loadingBusy()}>
              <GitMetaPill tone="neutral">Refreshing…</GitMetaPill>
            </Show>
            <Show when={props.showMobileSidebarButton && props.onToggleSidebar}>
              <Button
                size="xs"
                variant="ghost"
                icon={History}
                class={cn('shrink-0', gitToneActionButtonClass())}
                aria-label="Toggle browser sidebar"
                onClick={props.onToggleSidebar}
              >
                Sidebar
              </Button>
            </Show>
            <Show when={props.onRefresh}>
              <Button size="xs" variant="ghost" class={cn('shrink-0', gitToneActionButtonClass())} icon={Refresh} onClick={props.onRefresh}>
                Refresh
              </Button>
            </Show>
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        <Show when={activeSubview() === 'changes'}>
          <GitChangesPanel
            repoSummary={props.repoSummary}
            workspace={props.workspace}
            selectedSection={props.selectedWorkspaceSection}
            onSelectSection={props.onSelectWorkspaceSection}
            selectedItem={props.selectedWorkspaceItem}
            onSelectItem={props.onSelectWorkspaceItem}
            busyWorkspaceKey={props.busyWorkspaceKey}
            busyWorkspaceAction={props.busyWorkspaceAction}
            loading={props.workspaceLoading}
            error={props.workspaceError}
            commitMessage={props.commitMessage}
            onCommitMessageChange={props.onCommitMessageChange}
            onCommit={props.onCommit}
            commitBusy={props.commitBusy}
            onStageSelected={props.onStageSelected}
            onUnstageSelected={props.onUnstageSelected}
            onBulkAction={props.onBulkAction}
          />
        </Show>

        <Show when={activeSubview() === 'branches'}>
          <GitBranchesPanel
            repoRootPath={props.repoSummary?.repoRootPath}
            repoSummary={props.repoSummary}
            workspace={props.workspace}
            selectedBranch={props.selectedBranch}
            selectedBranchSubview={props.selectedBranchSubview}
            onSelectBranchSubview={props.onSelectBranchSubview}
            branches={props.branches}
            branchesLoading={props.branchesLoading}
            branchesError={props.branchesError}
            workspaceLoading={props.workspaceLoading}
            workspaceError={props.workspaceError}
            commits={props.commits}
            listLoading={props.listLoading}
            listLoadingMore={props.listLoadingMore}
            listError={props.listError}
            hasMore={props.hasMore}
            selectedCommitHash={props.selectedCommitHash}
            onSelectCommit={props.onSelectCommit}
            onLoadMore={props.onLoadMore}
          />
        </Show>

        <Show when={activeSubview() === 'history'}>
          <GitHistoryBrowser
            class="h-full"
            currentPath={props.currentPath}
            repoInfo={props.repoInfo}
            repoInfoLoading={props.repoInfoLoading}
            selectedCommitHash={props.selectedCommitHash}
          />
        </Show>
      </div>
    </div>
  );
}
