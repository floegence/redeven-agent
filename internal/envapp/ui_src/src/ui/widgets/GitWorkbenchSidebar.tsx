import { For, Show } from 'solid-js';
import { cn } from '@floegence/floe-webapp-core';
import { SnakeLoader } from '@floegence/floe-webapp-core/loading';
import { Button } from '@floegence/floe-webapp-core/ui';
import type {
  GitBranchSummary,
  GitCommitSummary,
  GitListBranchesResponse,
  GitListWorkspaceChangesResponse,
  GitRepoSummaryResponse,
  GitWorkspaceChange,
} from '../protocol/redeven_v1';
import {
  WORKSPACE_SECTIONS,
  branchDisplayName,
  branchIdentity,
  branchStatusSummary,
  changeMetricsText,
  changeSecondaryPath,
  summarizeWorkspaceCount,
  workspaceEntryKey,
  workspaceSectionCount,
  workspaceSectionItems,
  workspaceSectionLabel,
  type GitWorkbenchSubview,
} from '../utils/gitWorkbench';
import {
  gitBranchTone,
  gitChangeTone,
  gitSubviewTone,
  gitToneBadgeClass,
  gitToneInsetClass,
  gitToneSelectableCardClass,
  gitToneSurfaceClass,
  workspaceSectionTone,
} from './GitChrome';

export interface GitWorkbenchSidebarProps {
  subview: GitWorkbenchSubview;
  onClose?: () => void;
  repoInfoLoading?: boolean;
  repoInfoError?: string;
  repoAvailable?: boolean;
  repoSummary?: GitRepoSummaryResponse | null;
  workspace?: GitListWorkspaceChangesResponse | null;
  workspaceLoading?: boolean;
  workspaceError?: string;
  selectedWorkspaceKey?: string;
  onSelectWorkspaceItem?: (item: GitWorkspaceChange) => void;
  branches?: GitListBranchesResponse | null;
  branchesLoading?: boolean;
  branchesError?: string;
  selectedBranchKey?: string;
  onSelectBranch?: (branch: GitBranchSummary) => void;
  commits?: GitCommitSummary[];
  listLoading?: boolean;
  listLoadingMore?: boolean;
  listError?: string;
  hasMore?: boolean;
  selectedCommitHash?: string;
  onSelectCommit?: (hash: string) => void;
  onLoadMore?: () => void;
  class?: string;
}

function formatRelativeTime(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '-';
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return new Date(ms).toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 5) return `${seconds}s ago`;
  return 'now';
}

function selectorLabel(view: GitWorkbenchSubview): string {
  switch (view) {
    case 'changes':
      return 'Workspace Summary';
    case 'branches':
      return 'Branch Scope';
    case 'history':
      return 'Commit History';
    default:
      return 'Overview Summary';
  }
}

function selectorDescription(view: GitWorkbenchSubview): string {
  switch (view) {
    case 'overview':
      return 'Quick counts and repository context.';
    case 'changes':
      return 'Choose a file to open its floating diff.';
    case 'branches':
      return 'Choose a branch to load compare context.';
    case 'history':
      return 'Choose a commit to inspect changed files.';
    default:
      return '';
  }
}

function overviewBadgeLabel(repoSummary?: GitRepoSummaryResponse | null): string {
  const headRef = String(repoSummary?.headRef ?? '').trim();
  if (headRef) return headRef;
  if (repoSummary?.detached) return 'Detached';
  return 'Ready';
}

function cardCountLabel(
  view: GitWorkbenchSubview,
  workspaceCount: number,
  branchCount: number,
  commitCount: number,
  repoSummary?: GitRepoSummaryResponse | null,
): string | number {
  switch (view) {
    case 'changes':
      return workspaceCount;
    case 'branches':
      return branchCount;
    case 'history':
      return commitCount;
    case 'overview':
    default:
      return overviewBadgeLabel(repoSummary);
  }
}

export function GitWorkbenchSidebar(props: GitWorkbenchSidebarProps) {
  const closeAfterPick = () => {
    props.onClose?.();
  };

  const workspaceCount = () => summarizeWorkspaceCount(props.workspace?.summary ?? props.repoSummary?.workspaceSummary);
  const localBranchCount = () => props.branches?.local.length ?? 0;
  const remoteBranchCount = () => props.branches?.remote.length ?? 0;
  const branchCount = () => localBranchCount() + remoteBranchCount();
  const commitCount = () => props.commits?.length ?? 0;
  const sidebarTone = () => gitSubviewTone(props.subview);

  return (
    <div class={cn('space-y-1.5 sm:space-y-2', props.class)}>
      <Show
        when={!props.repoInfoLoading}
        fallback={<div class="flex items-center gap-2 py-3 text-xs text-muted-foreground"><SnakeLoader size="sm" /><span>Checking repository...</span></div>}
      >
        <Show when={!props.repoInfoError} fallback={<div class="py-3 text-xs break-words text-error">{props.repoInfoError}</div>}>
          <Show when={props.repoAvailable} fallback={<div class="py-3 text-xs text-muted-foreground">Current path is not inside a Git repository.</div>}>
            <div class="space-y-1.5 sm:space-y-2">
              <div class={cn('rounded-2xl border p-2 sm:p-2.5', gitToneSurfaceClass(sidebarTone()))}>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">{selectorLabel(props.subview)}</span>
                  <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass(sidebarTone()))}>
                    {cardCountLabel(props.subview, workspaceCount(), branchCount(), commitCount(), props.repoSummary)}
                  </span>
                </div>
                <div class="mt-1 text-[11px] text-muted-foreground">{selectorDescription(props.subview)}</div>
              </div>

              <Show when={props.subview === 'overview'}>
                <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div class={cn('rounded-xl border px-2 py-1.5', gitToneInsetClass(workspaceCount() > 0 ? 'warning' : 'success'))}>
                    <div class="text-muted-foreground">Workspace Summary</div>
                    <div class="mt-0.5 text-sm font-semibold text-foreground">{workspaceCount()}</div>
                    <div class="mt-1 text-[10px] text-muted-foreground">{workspaceCount() > 0 ? 'Files need review' : 'Working tree is clean'}</div>
                  </div>
                  <div class={cn('rounded-xl border px-2 py-1.5', gitToneInsetClass('violet'))}>
                    <div class="text-muted-foreground">Branch Scope</div>
                    <div class="mt-0.5 text-sm font-semibold text-foreground">{branchCount()}</div>
                    <div class="mt-1 text-[10px] text-muted-foreground">{localBranchCount()} local · {remoteBranchCount()} remote</div>
                  </div>
                  <div class={cn('rounded-xl border px-2 py-1.5', gitToneInsetClass('brand'))}>
                    <div class="text-muted-foreground">Commit History</div>
                    <div class="mt-0.5 text-sm font-semibold text-foreground">{commitCount()}</div>
                    <div class="mt-1 text-[10px] text-muted-foreground">Recent commits loaded</div>
                  </div>
                  <div class={cn('rounded-xl border px-2 py-1.5', gitToneInsetClass('neutral'))}>
                    <div class="text-muted-foreground">Stashes</div>
                    <div class="mt-0.5 text-sm font-semibold text-foreground">{props.repoSummary?.stashCount ?? 0}</div>
                    <div class="mt-1 text-[10px] text-muted-foreground">Saved work</div>
                  </div>
                </div>
              </Show>

              <Show when={props.subview === 'changes'}>
                <Show
                  when={!props.workspaceLoading}
                  fallback={<div class="flex items-center gap-2 py-3 text-xs text-muted-foreground"><SnakeLoader size="sm" /><span>Loading workspace changes...</span></div>}
                >
                  <Show when={!props.workspaceError} fallback={<div class="py-3 text-xs break-words text-error">{props.workspaceError}</div>}>
                    <div class="space-y-1.5 sm:space-y-2">
                      <For each={WORKSPACE_SECTIONS}>
                        {(section) => {
                          const items = () => workspaceSectionItems(props.workspace, section);
                          const tone = () => workspaceSectionTone(section);
                          return (
                            <section class={cn('rounded-2xl border p-2 sm:p-2.5', gitToneSurfaceClass(tone()))}>
                              <div class="mb-1.5 flex items-center justify-between gap-2">
                                <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass(tone()))}>{workspaceSectionLabel(section)}</span>
                                <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('neutral'))}>
                                  {workspaceSectionCount(props.workspace?.summary ?? props.repoSummary?.workspaceSummary, section)}
                                </span>
                              </div>
                              <Show
                                when={items().length > 0}
                                fallback={<div class={cn('rounded-xl border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground', gitToneInsetClass(tone()))}>No files in this section.</div>}
                              >
                                <div class="space-y-1.5">
                                  <For each={items()}>
                                    {(item) => {
                                      const active = () => props.selectedWorkspaceKey === workspaceEntryKey(item);
                                      return (
                                        <button
                                          type="button"
                                          class={cn('w-full rounded-xl border px-2.5 py-1.5 text-left', gitToneSelectableCardClass(tone(), active()))}
                                          onClick={() => {
                                            props.onSelectWorkspaceItem?.(item);
                                            closeAfterPick();
                                          }}
                                        >
                                          <div class="min-w-0">
                                            <div class="truncate text-[11.5px] font-medium text-current" title={changeSecondaryPath(item)}>{changeSecondaryPath(item)}</div>
                                            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                              <span class={cn('rounded-full border px-2 py-0.5 font-medium', gitToneBadgeClass(gitChangeTone(item.changeType)))}>{item.changeType || 'modified'}</span>
                                              <span class={cn('rounded-full border px-2 py-0.5 font-medium', gitToneBadgeClass('neutral'))}>{changeMetricsText(item)}</span>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    }}
                                  </For>
                                </div>
                              </Show>
                            </section>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
              </Show>

              <Show when={props.subview === 'branches'}>
                <Show
                  when={!props.branchesLoading}
                  fallback={<div class="flex items-center gap-2 py-3 text-xs text-muted-foreground"><SnakeLoader size="sm" /><span>Loading branches...</span></div>}
                >
                  <Show when={!props.branchesError} fallback={<div class="py-3 text-xs break-words text-error">{props.branchesError}</div>}>
                    <div class="space-y-1.5 sm:space-y-2">
                      <section class={cn('rounded-2xl border p-2 sm:p-2.5', gitToneSurfaceClass('brand'))}>
                        <div class="mb-1.5 flex items-center justify-between gap-2">
                          <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('brand'))}>Local Branches</span>
                          <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('neutral'))}>{localBranchCount()}</span>
                        </div>
                        <Show
                          when={localBranchCount() > 0}
                          fallback={<div class={cn('rounded-xl border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground', gitToneInsetClass('neutral'))}>No local branches.</div>}
                        >
                          <div class="space-y-1.5">
                            <For each={props.branches?.local ?? []}>
                              {(branch) => {
                                const tone = () => gitBranchTone(branch);
                                const active = () => props.selectedBranchKey === branchIdentity(branch);
                                return (
                                  <button
                                    type="button"
                                    class={cn('w-full rounded-xl border px-2.5 py-1.5 text-left', gitToneSelectableCardClass(tone(), active()))}
                                    onClick={() => {
                                      props.onSelectBranch?.(branch);
                                      closeAfterPick();
                                    }}
                                  >
                                    <div class="min-w-0">
                                      <div class="flex items-center gap-2">
                                        <span class="min-w-0 flex-1 truncate text-[11.5px] font-medium text-current">{branchDisplayName(branch)}</span>
                                        <Show when={branch.current}>
                                          <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('brand'))}>Current</span>
                                        </Show>
                                      </div>
                                      <div class="mt-1 truncate text-[10px] text-muted-foreground">{branchStatusSummary(branch)}</div>
                                    </div>
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </section>

                      <section class={cn('rounded-2xl border p-2 sm:p-2.5', gitToneSurfaceClass('violet'))}>
                        <div class="mb-1.5 flex items-center justify-between gap-2">
                          <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('violet'))}>Remote Branches</span>
                          <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('neutral'))}>{remoteBranchCount()}</span>
                        </div>
                        <Show
                          when={remoteBranchCount() > 0}
                          fallback={<div class={cn('rounded-xl border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground', gitToneInsetClass('violet'))}>No remote branches.</div>}
                        >
                          <div class="space-y-1.5">
                            <For each={props.branches?.remote ?? []}>
                              {(branch) => {
                                const active = () => props.selectedBranchKey === branchIdentity(branch);
                                return (
                                  <button
                                    type="button"
                                    class={cn('w-full rounded-xl border px-2.5 py-1.5 text-left', gitToneSelectableCardClass('violet', active()))}
                                    onClick={() => {
                                      props.onSelectBranch?.(branch);
                                      closeAfterPick();
                                    }}
                                  >
                                    <div class="truncate text-[11.5px] font-medium text-current">{branchDisplayName(branch)}</div>
                                    <div class="mt-1 truncate text-[10px] text-muted-foreground">{branch.subject || branchStatusSummary(branch)}</div>
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </section>
                    </div>
                  </Show>
                </Show>
              </Show>

              <Show when={props.subview === 'history'}>
                <section class={cn('rounded-2xl border p-2 sm:p-2.5', gitToneSurfaceClass('brand'))}>
                  <div class="mb-1.5 flex items-center justify-between gap-2">
                    <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('brand'))}>Recent Commits</span>
                    <span class={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', gitToneBadgeClass('neutral'))}>{commitCount()}</span>
                  </div>

                  <Show
                    when={!props.listLoading}
                    fallback={<div class="flex items-center gap-2 py-3 text-xs text-muted-foreground"><SnakeLoader size="sm" /><span>Loading commits...</span></div>}
                  >
                    <Show when={!props.listError} fallback={<div class="py-3 text-xs break-words text-error">{props.listError}</div>}>
                      <Show
                        when={commitCount() > 0}
                        fallback={<div class={cn('rounded-xl border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground', gitToneInsetClass('brand'))}>This repository has no commits yet.</div>}
                      >
                        <div class="space-y-1.5">
                          <For each={props.commits ?? []}>
                            {(commit) => {
                              const active = () => props.selectedCommitHash === commit.hash;
                              return (
                                <button
                                  type="button"
                                  class={cn('w-full rounded-xl border px-2.5 py-1.5 text-left', gitToneSelectableCardClass('brand', active()))}
                                  onClick={() => {
                                    props.onSelectCommit?.(commit.hash);
                                    closeAfterPick();
                                  }}
                                >
                                  <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                      <div class="truncate text-[11.5px] font-medium text-current">{commit.subject || '(no subject)'}</div>
                                      <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                        <span class={cn('rounded-full border px-2 py-0.5 font-medium', gitToneBadgeClass('brand'))}>{commit.shortHash}</span>
                                        <span>{commit.authorName || '-'}</span>
                                      </div>
                                    </div>
                                    <span class="shrink-0 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      {formatRelativeTime(commit.authorTimeMs)}
                                    </span>
                                  </div>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    </Show>
                  </Show>

                  <Show when={props.hasMore}>
                    <div class="mt-2 border-t border-border/60 pt-2">
                      <Button size="sm" variant="outline" class="w-full cursor-pointer" onClick={props.onLoadMore} loading={props.listLoadingMore} disabled={props.listLoadingMore}>
                        Load More
                      </Button>
                    </div>
                  </Show>
                </section>
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
