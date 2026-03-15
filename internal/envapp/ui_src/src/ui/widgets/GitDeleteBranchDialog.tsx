import { Show, createEffect, createSignal } from 'solid-js';
import { cn, useLayout } from '@floegence/floe-webapp-core';
import { Shield, Trash } from '@floegence/floe-webapp-core/icons';
import { Button, Checkbox, Dialog, Input } from '@floegence/floe-webapp-core/ui';
import type { GitBranchSummary, GitPreviewDeleteBranchResponse, GitWorkspaceSummary } from '../protocol/redeven_v1';
import { branchDisplayName, summarizeWorkspaceCount } from '../utils/gitWorkbench';
import { GitChecklistItem, GitLabelBlock, GitMetaPill, GitPrimaryTitle, GitSection, GitStatePane, GitStatStrip, GitSubtleNote } from './GitWorkbenchPrimitives';

export type GitDeleteBranchDialogState = 'idle' | 'previewing' | 'deleting';

export interface GitDeleteBranchDialogConfirmOptions {
  removeLinkedWorktree: boolean;
  discardLinkedWorktreeChanges: boolean;
  planFingerprint?: string;
}

export interface GitDeleteBranchDialogProps {
  open: boolean;
  branch?: GitBranchSummary | null;
  preview?: GitPreviewDeleteBranchResponse | null;
  previewError?: string;
  actionError?: string;
  state?: GitDeleteBranchDialogState;
  onClose: () => void;
  onRetryPreview?: (branch: GitBranchSummary) => void;
  onConfirm?: (branch: GitBranchSummary, options: GitDeleteBranchDialogConfirmOptions) => void;
}

function fileCountLabel(count: number): string {
  return `${count} file${count === 1 ? '' : 's'}`;
}

function formatPendingSummary(summary: GitWorkspaceSummary | null | undefined): string {
  const staged = Number(summary?.stagedCount ?? 0);
  const unstaged = Number(summary?.unstagedCount ?? 0);
  const untracked = Number(summary?.untrackedCount ?? 0);
  const conflicted = Number(summary?.conflictedCount ?? 0);

  const items: string[] = [];
  if (staged > 0) items.push(`${staged} staged`);
  if (unstaged > 0) items.push(`${unstaged} unstaged`);
  if (untracked > 0) items.push(`${untracked} untracked`);
  if (conflicted > 0) items.push(`${conflicted} conflicted`);

  if (items.length <= 0) return 'Linked worktree is clean.';
  return items.join(' · ');
}

export function GitDeleteBranchDialog(props: GitDeleteBranchDialogProps) {
  const layout = useLayout();

  const [confirmWorktreeRemoval, setConfirmWorktreeRemoval] = createSignal(false);
  const [confirmDiscardChanges, setConfirmDiscardChanges] = createSignal(false);
  const [typedBranchName, setTypedBranchName] = createSignal('');

  const branchName = () => branchDisplayName(props.branch);
  const preview = () => props.preview ?? null;
  const linkedWorktree = () => preview()?.linkedWorktree;
  const linkedWorkspaceCount = () => summarizeWorkspaceCount(linkedWorktree()?.summary);
  const safeDeleteBlocked = () => Boolean(preview() && !preview()!.safeDeleteAllowed);
  const blockingReason = () => String(preview()?.blockingReason ?? '').trim();
  const state = () => props.state ?? 'idle';
  const loading = () => state() === 'previewing';
  const deleting = () => state() === 'deleting';
  const requiresWorktreeRemoval = () => Boolean(preview()?.requiresWorktreeRemoval);
  const requiresDiscardConfirmation = () => Boolean(preview()?.requiresDiscardConfirmation);
  const linkedWorktreePath = () => linkedWorktree()?.worktreePath || 'the linked worktree path';
  const worktreeAccessible = () => Boolean(linkedWorktree()?.accessible);

  createEffect(() => {
    if (!props.open) return;
    setConfirmWorktreeRemoval(false);
    setConfirmDiscardChanges(false);
    setTypedBranchName('');
  });

  const canConfirm = () => {
    const currentBranch = props.branch;
    const currentPreview = preview();
    if (!props.open || !currentBranch || !currentPreview) return false;
    if (loading() || deleting()) return false;
    if (blockingReason() || safeDeleteBlocked()) return false;
    if (!currentPreview.requiresWorktreeRemoval) return true;
    if (!confirmWorktreeRemoval() || !confirmDiscardChanges()) return false;
    if (!currentPreview.requiresDiscardConfirmation) return true;
    return typedBranchName().trim() === branchName();
  };

  const confirmLabel = () => {
    if (deleting()) return 'Deleting...';
    if (!requiresWorktreeRemoval()) return 'Delete Branch';
    if (requiresDiscardConfirmation()) return 'Discard Changes, Delete Worktree and Branch';
    return 'Delete Worktree and Branch';
  };

  const deleteReadinessLabel = () => {
    if (blockingReason() || safeDeleteBlocked()) return 'Blocked';
    return canConfirm() ? 'Ready to delete' : 'Review required';
  };

  const deleteStatusValue = () => {
    if (blockingReason() || safeDeleteBlocked()) return <GitMetaPill tone="warning">Blocked</GitMetaPill>;
    if (canConfirm()) return <GitMetaPill tone="success">Ready to delete</GitMetaPill>;
    return <GitMetaPill tone="warning">Review required</GitMetaPill>;
  };

  const discardLabel = () => {
    if (!requiresWorktreeRemoval()) return 'None';
    if (!worktreeAccessible() && linkedWorkspaceCount() <= 0) return 'Unknown';
    if (linkedWorkspaceCount() <= 0) return 'No pending files';
    return fileCountLabel(linkedWorkspaceCount());
  };

  const impactDescription = () => {
    if (!requiresWorktreeRemoval()) return 'This action removes only the local branch reference.';
    return 'This action removes the linked worktree and permanently discards its uncommitted changes.';
  };

  const worktreeImpactDetail = () => {
    if (!requiresWorktreeRemoval()) return 'No linked worktree cleanup.';
    if (!worktreeAccessible()) {
      if (linkedWorkspaceCount() > 0) {
        return `${fileCountLabel(linkedWorkspaceCount())} will be discarded. File-by-file details are unavailable from the current agent scope.`;
      }
      return 'Change details are unavailable from the current agent scope.';
    }
    return formatPendingSummary(linkedWorktree()?.summary);
  };

  const dialogWidthClass = () => {
    if (layout.isMobile()) return 'w-[calc(100vw-0.5rem)] max-w-none';
    return requiresWorktreeRemoval() ? 'w-[min(46rem,94vw)]' : 'w-[min(36rem,94vw)]';
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title="Delete Branch"
      description={impactDescription()}
      footer={(
        <div class="border-t border-border/60 bg-background/88 px-4 pt-3 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/78">
          <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button size="sm" variant="outline" class="w-full sm:w-auto" disabled={loading() || deleting()} onClick={props.onClose}>
              Cancel
            </Button>
            <Show when={props.previewError && props.branch}>
              <Button
                size="sm"
                variant="outline"
                class="w-full sm:w-auto"
                disabled={loading() || deleting()}
                onClick={() => props.branch && props.onRetryPreview?.(props.branch)}
              >
                Retry Review
              </Button>
            </Show>
            <Button
              size="sm"
              variant="destructive"
              class="w-full sm:w-auto"
              disabled={!canConfirm()}
              loading={deleting()}
              onClick={() => {
                const branch = props.branch;
                const currentPreview = preview();
                if (!branch || !currentPreview) return;
                props.onConfirm?.(branch, {
                  removeLinkedWorktree: Boolean(currentPreview.requiresWorktreeRemoval),
                  discardLinkedWorktreeChanges: Boolean(currentPreview.requiresDiscardConfirmation),
                  planFingerprint: currentPreview.planFingerprint,
                });
              }}
            >
              {confirmLabel()}
            </Button>
          </div>
        </div>
      )}
      class={cn(
        'flex max-w-none flex-col overflow-hidden rounded-md p-0',
        '[&>div:first-child]:border-b-0 [&>div:first-child]:pb-2',
        '[&>div:last-child]:min-h-0 [&>div:last-child]:flex [&>div:last-child]:flex-1 [&>div:last-child]:flex-col [&>div:last-child]:!overflow-hidden [&>div:last-child]:!p-0',
        dialogWidthClass(),
      )}
    >
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Show
          when={!loading()}
          fallback={<GitStatePane loading message="Reviewing branch deletion..." class="m-4" surface />}
        >
          <Show when={!props.previewError} fallback={<GitStatePane tone="error" message={props.previewError ?? 'Delete review failed.'} class="m-4" surface />}>
            <Show when={props.branch && preview()} fallback={<GitStatePane message="Choose a branch to review its deletion plan." class="m-4" surface />}>
              <div class="flex flex-col gap-3 px-4 pt-2 pb-4">
                <GitSection
                  label="Delete Impact"
                  tone={requiresWorktreeRemoval() ? 'danger' : 'warning'}
                  description="Only the information needed for the destructive decision is shown here."
                  aside={<GitMetaPill tone={blockingReason() || safeDeleteBlocked() ? 'warning' : requiresWorktreeRemoval() ? 'danger' : 'warning'}>{deleteReadinessLabel()}</GitMetaPill>}
                  class="border-border/70 shadow-sm shadow-black/5 ring-1 ring-black/[0.02]"
                  bodyClass="space-y-3"
                >
                  <GitLabelBlock label="Branch" tone={requiresWorktreeRemoval() ? 'danger' : 'warning'}>
                    <div class="flex flex-wrap items-center gap-2.5">
                      <GitPrimaryTitle>{branchName()}</GitPrimaryTitle>
                      <Show when={preview()?.safeDeleteBaseRef}>
                        <GitMetaPill tone={safeDeleteBlocked() || blockingReason() ? 'warning' : 'success'}>
                          Delete base {preview()?.safeDeleteBaseRef}
                        </GitMetaPill>
                      </Show>
                      <Show when={requiresWorktreeRemoval()}>
                        <GitMetaPill tone="danger">Linked worktree attached</GitMetaPill>
                      </Show>
                    </div>
                    <div class="text-[11px] leading-relaxed text-muted-foreground">{impactDescription()}</div>
                  </GitLabelBlock>

                  <GitStatStrip
                    columnsClass="grid-cols-1 gap-1 sm:grid-cols-2"
                    items={[
                      { label: 'Branch', value: branchName() },
                      { label: 'Worktree', value: requiresWorktreeRemoval() ? linkedWorktreePath() : 'Not affected' },
                      { label: 'Files discarded', value: discardLabel() },
                      { label: 'Delete status', value: deleteStatusValue() },
                    ]}
                  />

                  <Show when={requiresWorktreeRemoval()}>
                    <GitSubtleNote class="border-warning/20 bg-warning/10 text-foreground">
                      <div class="space-y-1">
                        <div class="text-[11px] font-semibold text-warning">Worktree impact</div>
                        <div class="text-[11px] leading-relaxed text-muted-foreground">{worktreeImpactDetail()}</div>
                      </div>
                    </GitSubtleNote>
                  </Show>

                  <Show
                    when={preview()?.safeDeleteAllowed}
                    fallback={<GitSubtleNote class="border-warning/25 bg-warning/10 text-warning-foreground">{preview()?.safeDeleteReason || 'Safe delete is blocked.'}</GitSubtleNote>}
                  >
                    <GitSubtleNote class="border-success/30 bg-success/14 text-foreground">
                      <div class="flex items-start gap-2">
                        <Shield class="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        <div class="space-y-1">
                          <div class="text-[11px] font-semibold text-success">Safe delete ready</div>
                          <div class="text-[11px] leading-relaxed text-muted-foreground">
                            Git can remove this branch with `git branch -d` once the required confirmations are complete.
                          </div>
                        </div>
                      </div>
                    </GitSubtleNote>
                  </Show>

                  <Show when={blockingReason()}>
                    <GitSubtleNote class="border-warning/25 bg-warning/10 text-warning-foreground">{blockingReason()}</GitSubtleNote>
                  </Show>
                  <Show when={props.actionError}>
                    <GitSubtleNote class="border-warning/25 bg-warning/10 text-warning-foreground">{props.actionError}</GitSubtleNote>
                  </Show>
                </GitSection>

                <GitSection
                  label="Delete Confirmation"
                  tone={requiresWorktreeRemoval() ? 'danger' : 'warning'}
                  description={requiresWorktreeRemoval()
                    ? 'Confirm the destructive parts of this action.'
                    : 'Confirm the local branch deletion.'}
                  aside={<GitMetaPill tone={requiresWorktreeRemoval() ? 'danger' : 'warning'}>{requiresWorktreeRemoval() ? 'Destructive action' : 'Local branch only'}</GitMetaPill>}
                  bodyClass="space-y-3"
                >
                  <GitSubtleNote class="border-border/55 bg-background/72 text-foreground">
                    <div class="flex items-start gap-2">
                      <Trash class={cn('mt-0.5 h-3.5 w-3.5 shrink-0', requiresWorktreeRemoval() ? 'text-error' : 'text-warning')} />
                      <span>
                        <Show
                          when={requiresWorktreeRemoval()}
                          fallback="Deleting this branch removes only the local branch reference. Your current working tree is not modified."
                        >
                          Deleting this branch removes the local branch reference, the linked worktree at {linkedWorktreePath()}, and all uncommitted files in that worktree.
                        </Show>
                      </span>
                    </div>
                  </GitSubtleNote>

                  <Show when={requiresWorktreeRemoval()}>
                    <div class="space-y-2">
                      <GitChecklistItem
                        index="1"
                        title="Approve linked worktree removal"
                        detail={`The linked worktree at ${linkedWorktreePath()} will be removed together with this branch.`}
                        tone="warning"
                        complete={confirmWorktreeRemoval()}
                      >
                        <Checkbox
                          checked={confirmWorktreeRemoval()}
                          onChange={setConfirmWorktreeRemoval}
                          label={`I understand the linked worktree at ${linkedWorktreePath()} will be removed.`}
                          size="sm"
                        />
                      </GitChecklistItem>

                      <GitChecklistItem
                        index="2"
                        title="Approve permanent file discard"
                        detail="Any staged, unstaged, untracked, or conflicted files inside that worktree will be lost."
                        tone="danger"
                        complete={confirmDiscardChanges()}
                      >
                        <Checkbox
                          checked={confirmDiscardChanges()}
                          onChange={setConfirmDiscardChanges}
                          label="I understand uncommitted changes in that worktree will be permanently discarded."
                          size="sm"
                        />
                      </GitChecklistItem>

                      <Show when={requiresDiscardConfirmation()}>
                        <GitChecklistItem
                          index="3"
                          title="Type the branch name"
                          detail={(
                            <>
                              Type <span class="font-semibold text-foreground">{branchName()}</span> to finish the final destructive gate.
                            </>
                          )}
                          tone="danger"
                          complete={typedBranchName().trim() === branchName()}
                        >
                          <div class="space-y-2">
                            <label class="block text-[11px] font-medium text-foreground">
                              Expected value: <span class="font-semibold">{branchName()}</span>
                            </label>
                            <Input
                              value={typedBranchName()}
                              size="sm"
                              class={cn(
                                'w-full font-mono',
                                typedBranchName().trim() === branchName()
                                  ? 'border-success/35 focus:border-success/35 focus:ring-success/25'
                                  : 'border-error/25 focus:border-error/30 focus:ring-error/25',
                              )}
                              placeholder={branchName()}
                              onInput={(event) => setTypedBranchName(event.currentTarget.value)}
                            />
                            <div class="text-[10px] leading-relaxed text-muted-foreground">
                              The destructive action unlocks only when the typed branch name matches exactly.
                            </div>
                          </div>
                        </GitChecklistItem>
                      </Show>
                    </div>
                  </Show>
                </GitSection>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </Dialog>
  );
}
