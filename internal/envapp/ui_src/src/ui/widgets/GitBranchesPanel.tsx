import { For, Show } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';
import { SnakeLoader } from '@floegence/floe-webapp-core/loading';
import { Button } from '@floegence/floe-webapp-core/ui';
import type {
  GitBranchSummary,
  GitCommitSummary,
  GitGetBranchCompareResponse,
  GitListWorkspaceChangesResponse,
  GitWorkspaceChange,
  GitWorkspaceSection,
} from '../protocol/redeven_v1';
import { branchDisplayName, syncStatusLabel, type GitBranchSubview } from '../utils/gitWorkbench';
import { gitToneActionButtonClass, gitToneSelectableCardClass } from './GitChrome';
import { GitChangesPanel } from './GitChangesPanel';
import { GitMetaPill, GitSection, GitSubtleNote } from './GitWorkbenchPrimitives';

export interface GitBranchesPanelProps {
  repoRootPath?: string;
  selectedBranch?: GitBranchSummary | null;
  selectedBranchSubview?: GitBranchSubview;
  onSelectBranchSubview?: (view: GitBranchSubview) => void;
  branchesLoading?: boolean;
  branchesError?: string;
  workspace?: GitListWorkspaceChangesResponse | null;
  workspaceLoading?: boolean;
  workspaceError?: string;
  selectedWorkspaceSection?: GitWorkspaceSection;
  onSelectWorkspaceSection?: (section: GitWorkspaceSection) => void;
  selectedWorkspaceItem?: GitWorkspaceChange | null;
  onSelectWorkspaceItem?: (item: GitWorkspaceChange) => void;
  busyWorkspaceKey?: string;
  busyWorkspaceAction?: 'stage' | 'unstage' | '';
  commits?: GitCommitSummary[];
  listLoading?: boolean;
  listLoadingMore?: boolean;
  listError?: string;
  hasMore?: boolean;
  selectedCommitHash?: string;
  onSelectCommit?: (hash: string) => void;
  onLoadMore?: () => void;
  commitMessage?: string;
  onCommitMessageChange?: (value: string) => void;
  onCommit?: (message: string) => void;
  commitBusy?: boolean;
  onStageSelected?: (item: GitWorkspaceChange) => void;
  onUnstageSelected?: (item: GitWorkspaceChange) => void;
  onBulkAction?: (section: GitWorkspaceSection) => void;
  compare?: GitGetBranchCompareResponse | null;
  compareLoading?: boolean;
  compareError?: string;
}

function formatAbsoluteTime(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString();
}

function HistoryList(props: Pick<
  GitBranchesPanelProps,
  'selectedBranch' | 'commits' | 'listLoading' | 'listLoadingMore' | 'listError' | 'hasMore' | 'selectedCommitHash' | 'onSelectCommit' | 'onLoadMore'
>) {
  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex-1 min-h-0 overflow-auto px-3 py-3 sm:px-4 sm:py-4">
        <div class="space-y-3">
          <GitSection
            label="Commit History"
            description={props.selectedBranch ? `Recent commits while reviewing ${branchDisplayName(props.selectedBranch)}.` : 'Recent repository commits.'}
            aside={<GitMetaPill tone="brand">{props.commits?.length ?? 0} loaded</GitMetaPill>}
            tone="brand"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <GitMetaPill tone="brand">{props.selectedBranch ? branchDisplayName(props.selectedBranch) : 'History'}</GitMetaPill>
              <Show when={props.selectedBranch?.current}>
                <GitMetaPill tone="success">Current</GitMetaPill>
              </Show>
              <Show when={props.selectedBranch}>
                <GitMetaPill tone="neutral">{syncStatusLabel(props.selectedBranch?.aheadCount, props.selectedBranch?.behindCount)}</GitMetaPill>
              </Show>
            </div>
          </GitSection>

          <Show
            when={!props.listLoading}
            fallback={(
              <div class="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                <SnakeLoader size="sm" />
                <span>Loading commit history...</span>
              </div>
            )}
          >
            <Show when={!props.listError} fallback={<div class="px-1 py-3 text-xs break-words text-error">{props.listError}</div>}>
              <Show
                when={(props.commits?.length ?? 0) > 0}
                fallback={<GitSubtleNote>No commit history is available for this repository.</GitSubtleNote>}
              >
                <div class="overflow-hidden rounded-md border border-border/65 bg-card">
                  <div class="max-h-[34rem] overflow-auto">
                    <table class="w-full min-w-[42rem] text-xs">
                      <thead class="sticky top-0 z-10 bg-muted/30 backdrop-blur">
                        <tr class="border-b border-border/60 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          <th class="px-3 py-2.5 font-medium">Commit</th>
                          <th class="px-3 py-2.5 font-medium">Author</th>
                          <th class="px-3 py-2.5 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={props.commits ?? []}>
                          {(commit) => {
                            const active = () => props.selectedCommitHash === commit.hash;
                            return (
                              <tr
                                class={cn(
                                  'cursor-pointer border-b border-border/45 last:border-b-0',
                                  active() ? 'bg-muted/45' : 'hover:bg-muted/25'
                                )}
                                onClick={() => props.onSelectCommit?.(commit.hash)}
                              >
                                <td class="px-3 py-2.5 align-top">
                                  <div class="min-w-0">
                                    <div class="truncate text-xs font-medium text-foreground">{commit.subject || '(no subject)'}</div>
                                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                      <GitMetaPill tone="neutral">{commit.shortHash}</GitMetaPill>
                                      <Show when={(commit.parents?.length ?? 0) > 1}>
                                        <GitMetaPill tone="violet">Merge x{commit.parents?.length}</GitMetaPill>
                                      </Show>
                                    </div>
                                  </div>
                                </td>
                                <td class="px-3 py-2.5 align-top text-muted-foreground">{commit.authorName || 'Unknown author'}</td>
                                <td class="px-3 py-2.5 align-top text-muted-foreground">{formatAbsoluteTime(commit.authorTimeMs)}</td>
                              </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Show>

              <Show when={props.hasMore}>
                <div class="pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    class={cn('w-full', gitToneActionButtonClass())}
                    onClick={props.onLoadMore}
                    loading={props.listLoadingMore}
                    disabled={props.listLoadingMore}
                  >
                    Load More
                  </Button>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function GitBranchesPanel(props: GitBranchesPanelProps) {
  const branchSubview = () => props.selectedBranchSubview ?? 'unstaged';

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <Show when={!props.branchesLoading} fallback={<div class="flex-1 px-3 py-4 text-xs text-muted-foreground">Loading branches...</div>}>
        <Show when={!props.branchesError} fallback={<div class="flex-1 px-3 py-4 text-xs break-words text-error">{props.branchesError}</div>}>
          <Show when={props.selectedBranch} fallback={<div class="flex-1 px-3 py-4 text-xs text-muted-foreground">Choose a branch from the left rail to inspect workspace sections or history.</div>}>
            <Show
              when={branchSubview() === 'history'}
              fallback={(
                <GitChangesPanel
                  workspace={props.workspace}
                  repoSummary={null}
                  selectedSection={props.selectedWorkspaceSection ?? 'unstaged'}
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
              )}
            >
              <HistoryList
                selectedBranch={props.selectedBranch}
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
          </Show>
        </Show>
      </Show>
    </div>
  );
}
