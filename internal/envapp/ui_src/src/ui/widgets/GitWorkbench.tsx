import { Show } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';
import { Refresh } from '@floegence/floe-webapp-core/icons';
import { Button } from '@floegence/floe-webapp-core/ui';
import type {
  GitBranchSummary,
  GitGetBranchCompareResponse,
  GitListBranchesResponse,
  GitListWorkspaceChangesResponse,
  GitRepoSummaryResponse,
  GitResolveRepoResponse,
  GitWorkspaceChange,
} from '../protocol/redeven_v1';
import { repoDisplayName, summarizeWorkspaceCount, type GitWorkbenchSubview } from '../utils/gitWorkbench';
import { GitOverviewPanel } from './GitOverviewPanel';
import { GitChangesPanel } from './GitChangesPanel';
import { GitBranchesPanel } from './GitBranchesPanel';
import { GitHistoryBrowser } from './GitHistoryBrowser';
import { gitSubviewTone, gitToneBadgeClass } from './GitChrome';

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
  selectedWorkspaceItem?: GitWorkspaceChange | null;
  workspaceInspectNonce?: number;
  branches?: GitListBranchesResponse | null;
  branchesLoading?: boolean;
  branchesError?: string;
  selectedBranch?: GitBranchSummary | null;
  compare?: GitGetBranchCompareResponse | null;
  compareLoading?: boolean;
  compareError?: string;
  selectedCommitHash?: string;
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
      return 'History';
    default:
      return 'Overview';
  }
}

export function GitWorkbench(props: GitWorkbenchProps) {
  const repoLabel = () => repoDisplayName(props.repoSummary?.repoRootPath || props.repoInfo?.repoRootPath || props.currentPath);
  const repoPath = () => String(props.repoSummary?.repoRootPath || props.repoInfo?.repoRootPath || props.currentPath || '/').trim() || '/';
  const changeCount = () => summarizeWorkspaceCount(props.workspace?.summary ?? props.repoSummary?.workspaceSummary);
  const headRef = () => String(props.repoSummary?.headRef || props.repoInfo?.headRef || '').trim();
  const loadingBusy = () => Boolean(props.repoInfoLoading || props.repoSummaryLoading || props.workspaceLoading || props.branchesLoading || props.compareLoading);
  const subviewTone = () => gitSubviewTone(props.subview);

  return (
    <div class={cn('relative flex h-full min-h-0 flex-col bg-background', props.class)}>
      <div class="shrink-0 border-b border-border/70 bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div class="flex flex-wrap items-start justify-between gap-2.5">
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
              <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal', gitToneBadgeClass(subviewTone()))}>
                {subviewLabel(props.subview)}
              </span>
              <Show when={loadingBusy()}>
                <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal', gitToneBadgeClass('warning'))}>Refreshing…</span>
              </Show>
              <Show when={headRef()}>
                <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal', gitToneBadgeClass('brand'))}>{headRef()}</span>
              </Show>
            </div>

            <div class="truncate text-sm font-semibold text-foreground">{repoLabel()}</div>

            <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span class="max-w-full truncate" title={repoPath()}>{repoPath()}</span>
              <span class={cn('rounded-full border px-2 py-0.5 font-medium', gitToneBadgeClass(changeCount() > 0 ? 'warning' : 'success'))}>
                {changeCount() > 0 ? `${changeCount()} changes` : 'Clean workspace'}
              </span>
              <Show when={typeof props.repoSummary?.aheadCount === 'number' || typeof props.repoSummary?.behindCount === 'number'}>
                <span class={cn('rounded-full border px-2 py-0.5 font-medium', gitToneBadgeClass('neutral'))}>
                  ↑{props.repoSummary?.aheadCount ?? 0} ↓{props.repoSummary?.behindCount ?? 0}
                </span>
              </Show>
            </div>
          </div>

          <Show when={props.onRefresh}>
            <Button size="sm" variant="outline" class="shrink-0 cursor-pointer" icon={Refresh} onClick={props.onRefresh}>
              Refresh
            </Button>
          </Show>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden bg-muted/[0.02]">
        <Show when={props.subview === 'overview'}>
          <GitOverviewPanel
            repoSummary={props.repoSummary}
            summaryLoading={props.repoSummaryLoading}
            summaryError={props.repoSummaryError}
            workspace={props.workspace}
            branches={props.branches}
            selectedBranch={props.selectedBranch}
            compare={props.compare}
            currentPath={props.currentPath}
          />
        </Show>

        <Show when={props.subview === 'changes'}>
          <GitChangesPanel
            repoRootPath={props.repoSummary?.repoRootPath}
            workspace={props.workspace}
            selectedItem={props.selectedWorkspaceItem}
            loading={props.workspaceLoading}
            error={props.workspaceError}
            inspectNonce={props.workspaceInspectNonce}
          />
        </Show>

        <Show when={props.subview === 'branches'}>
          <GitBranchesPanel
            repoRootPath={props.repoSummary?.repoRootPath}
            selectedBranch={props.selectedBranch}
            branchesLoading={props.branchesLoading}
            branchesError={props.branchesError}
            compare={props.compare}
            compareLoading={props.compareLoading}
            compareError={props.compareError}
          />
        </Show>

        <Show when={props.subview === 'history'}>
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
