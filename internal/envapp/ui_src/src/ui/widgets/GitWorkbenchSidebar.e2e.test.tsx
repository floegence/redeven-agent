// @vitest-environment jsdom

import { LayoutProvider } from '@floegence/floe-webapp-core';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitWorkbenchSidebar } from './GitWorkbenchSidebar';

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

describe('GitWorkbenchSidebar interactions', () => {
  it('acts as selector-only content and closes after picking a workspace item', () => {
    let selectedPath = '';
    let closeCount = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => (
      <LayoutProvider>
        <div class="relative h-[520px]">
          <GitWorkbenchSidebar
            subview="changes"
            repoAvailable
            repoSummary={{
              repoRootPath: '/workspace/repo',
              headRef: 'main',
              headCommit: 'abc1234',
              aheadCount: 1,
              behindCount: 0,
              workspaceSummary: { stagedCount: 1, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0 },
            }}
            workspace={{
              repoRootPath: '/workspace/repo',
              summary: { stagedCount: 1, unstagedCount: 0, untrackedCount: 0, conflictedCount: 0 },
              staged: [
                { section: 'staged', changeType: 'modified', path: 'src/app.ts', displayPath: 'src/app.ts', additions: 3, deletions: 1 },
              ],
              unstaged: [],
              untracked: [],
              conflicted: [],
            }}
            branches={{
              repoRootPath: '/workspace/repo',
              currentRef: 'main',
              local: [{ name: 'main', fullName: 'refs/heads/main', kind: 'local', current: true }],
              remote: [],
            }}
            selectedWorkspaceKey="staged:modified:src/app.ts::"
            onSelectWorkspaceItem={(item) => {
              selectedPath = String(item.path || '');
            }}
            onClose={() => {
              closeCount += 1;
            }}
          />
        </div>
      </LayoutProvider>
    ), host);

    try {
      expect(Array.from(host.querySelectorAll('button')).some((node) => node.textContent?.trim() === 'Files')).toBe(false);
      const itemButton = Array.from(host.querySelectorAll('button')).find((node) => node.textContent?.includes('src/app.ts'));
      expect(itemButton).toBeTruthy();
      itemButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(host.textContent).toContain('Workspace Summary');
      expect(host.textContent).not.toContain('Workspace Files');
      expect(selectedPath).toBe('src/app.ts');
      expect(closeCount).toBe(1);
    } finally {
      dispose();
    }
  });

  it('renders compact overview metrics with the unified git language', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(() => (
      <LayoutProvider>
        <div class="relative h-[520px]">
          <GitWorkbenchSidebar
            subview="overview"
            repoAvailable
            repoSummary={{
              repoRootPath: '/workspace/repo',
              headRef: 'main',
              headCommit: 'abc1234',
              stashCount: 2,
              aheadCount: 0,
              behindCount: 0,
              workspaceSummary: { stagedCount: 1, unstagedCount: 2, untrackedCount: 0, conflictedCount: 0 },
            }}
            branches={{
              repoRootPath: '/workspace/repo',
              currentRef: 'main',
              local: [{ name: 'main', fullName: 'refs/heads/main', kind: 'local', current: true }],
              remote: [{ name: 'origin/main', fullName: 'refs/remotes/origin/main', kind: 'remote', current: false }],
            }}
            commits={[
              { hash: '1111111111111111', shortHash: '11111111', parents: ['0000000000000000'], subject: 'First commit', authorName: 'Alice', authorEmail: 'alice@example.com', authorTimeMs: Date.now() - 120000 },
              { hash: '2222222222222222', shortHash: '22222222', parents: ['1111111111111111'], subject: 'Second commit', authorName: 'Bob', authorEmail: 'bob@example.com', authorTimeMs: Date.now() - 240000 },
            ]}
          />
        </div>
      </LayoutProvider>
    ), host);

    try {
      expect(host.textContent).toContain('Overview Summary');
      expect(host.textContent).toContain('Quick counts and repository context.');
      expect(host.textContent).toContain('Workspace Summary');
      expect(host.textContent).toContain('Branch Scope');
      expect(host.textContent).toContain('Commit History');
      expect(host.textContent).toContain('Stashes');
      expect(host.textContent).not.toContain('Workspace Files');
      expect(host.textContent).not.toContain('History loaded');
    } finally {
      dispose();
    }
  });
});
