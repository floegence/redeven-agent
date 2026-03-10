// @vitest-environment jsdom

import { LayoutProvider, NotificationProvider } from '@floegence/floe-webapp-core';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitBranchesPanel } from './GitBranchesPanel';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('GitBranchesPanel interactions', () => {
  it('reuses the changes table when a branch section points to workspace changes', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => (
      <LayoutProvider>
        <NotificationProvider>
          <div class="h-[640px]">
            <GitBranchesPanel
              repoRootPath="/workspace/repo"
              selectedBranch={{
                name: 'feature/demo',
                fullName: 'refs/heads/feature/demo',
                kind: 'local',
                current: true,
              }}
              selectedBranchSubview="unstaged"
              workspace={{
                repoRootPath: '/workspace/repo',
                summary: { stagedCount: 1, unstagedCount: 1, untrackedCount: 0, conflictedCount: 0 },
                staged: [{ section: 'staged', changeType: 'modified', path: 'src/app.ts', displayPath: 'src/app.ts', additions: 3, deletions: 1 }],
                unstaged: [{ section: 'unstaged', changeType: 'modified', path: 'src/next.ts', displayPath: 'src/next.ts', additions: 4, deletions: 2 }],
                untracked: [],
                conflicted: [],
              }}
              selectedWorkspaceSection="unstaged"
            />
          </div>
        </NotificationProvider>
      </LayoutProvider>
    ), host);

    try {
      expect(host.textContent).toContain('Unstaged');
      expect(host.textContent).toContain('Path');
      expect(host.textContent).toContain('src/next.ts');
      expect(host.textContent).toContain('+ Stage');
      expect(host.textContent).not.toContain('Branch Snapshot');
      expect(host.textContent).not.toContain('Compare Summary');
    } finally {
      dispose();
    }
  });

  it('shows the full commit history list when branch history is selected', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => (
      <LayoutProvider>
        <NotificationProvider>
          <div class="h-[640px]">
            <GitBranchesPanel
              repoRootPath="/workspace/repo"
              selectedBranch={{
                name: 'feature/demo',
                fullName: 'refs/heads/feature/demo',
                kind: 'local',
                current: true,
                aheadCount: 1,
                behindCount: 0,
              }}
              selectedBranchSubview="history"
              commits={[
                { hash: '1111111111111111', shortHash: '11111111', parents: ['0000000000000000'], subject: 'First commit', authorName: 'Alice', authorTimeMs: 1706000000000 },
                { hash: '2222222222222222', shortHash: '22222222', parents: ['1111111111111111', '9999999999999999'], subject: 'Merge feature', authorName: 'Bob', authorTimeMs: 1706003600000 },
              ]}
              selectedCommitHash="2222222222222222"
            />
          </div>
        </NotificationProvider>
      </LayoutProvider>
    ), host);

    try {
      expect(host.textContent).toContain('Commit History');
      expect(host.textContent).toContain('First commit');
      expect(host.textContent).toContain('Merge feature');
      expect(host.textContent).toContain('11111111');
      expect(host.textContent).not.toContain('Diff Inspector');
    } finally {
      dispose();
    }
  });

  it('uses the left-rail empty-state copy before a branch is selected', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => (
      <LayoutProvider>
        <NotificationProvider>
          <div class="h-[640px]">
            <GitBranchesPanel repoRootPath="/workspace/repo" />
          </div>
        </NotificationProvider>
      </LayoutProvider>
    ), host);

    try {
      expect(host.textContent).toContain('Choose a branch from the left rail to inspect workspace sections or history.');
      expect(host.textContent).not.toContain('Choose a branch from the left rail to inspect compare details.');
    } finally {
      dispose();
    }
  });
});
