import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function read(relPath: string): string {
  const here = fileURLToPath(import.meta.url);
  const dir = path.dirname(here);
  return fs.readFileSync(path.resolve(dir, relPath), 'utf8');
}

describe('browser workspace layout wiring', () => {
  it('shares one sidebar width state across files mode and git mode', () => {
    const src = read('./RemoteFileBrowser.tsx');

    expect(src).toContain("const PAGE_SIDEBAR_WIDTH_STORAGE_KEY = 'redeven:remote-file-browser:page-sidebar-width';");
    expect(src).toContain('width={browserSidebarWidth()}');
    expect(src).toContain('setBrowserSidebarWidth((width) => normalizePageSidebarWidth(width + delta))');
  });

  it('routes files mode and git mode through dedicated unified workspace shells', () => {
    const src = read('./RemoteFileBrowser.tsx');

    expect(src).toContain("import { FileBrowserWorkspace } from './FileBrowserWorkspace';");
    expect(src).toContain("import { GitWorkspace } from './GitWorkspace';");
    expect(src).toContain('<FileBrowserWorkspace');
    expect(src).toContain('<GitWorkspace');
    expect(src).not.toContain('sidebarHeaderActions={');
  });

  it('keeps mode and git subview navigation out of selector-only sidebar content', () => {
    const src = read('./GitWorkbenchSidebar.tsx');

    expect(src).not.toContain('SidebarPane');
    expect(src).not.toContain('GitHistoryModeSwitch');
    expect(src).not.toContain('GitSubviewSwitch');
  });

  it('pins the mode switch area in the shared browser shell', () => {
    const src = read('./BrowserWorkspaceShell.tsx');

    expect(src).toContain('Mode');
    expect(src).toContain('props.modeSwitcher');
  });

  it('uses a compact mode switch and mobile activity bar in the shared browser shell', () => {
    const modeSrc = read('./GitHistoryModeSwitch.tsx');
    const shellSrc = read('./BrowserWorkspaceShell.tsx');
    const navSrc = read('./GitViewNav.tsx');

    expect(modeSrc).toContain('role="radiogroup"');
    expect(modeSrc).toContain('aria-label="Browser mode"');
    expect(modeSrc).toContain('inline-flex w-full items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5');
    expect(modeSrc).not.toContain('>Browse<');
    expect(modeSrc).not.toContain('>Inspect<');

    expect(shellSrc).toContain('ActivityBar');
    expect(shellSrc).toContain('showSidebarToggle');
    expect(shellSrc).toContain('sidebarToggleLabel');
    expect(shellSrc).toContain('sidebarToggleIcon');

    expect(navSrc).toContain('role="tablist"');
    expect(navSrc).toContain('aria-label="Git views"');
    expect(navSrc).toContain('rounded-lg border px-2.5 py-2');
  });

  it('uses floating diff dialogs instead of inline patch sections', () => {
    const changesSrc = read('./GitChangesPanel.tsx');
    const branchesSrc = read('./GitBranchesPanel.tsx');
    const historySrc = read('./GitHistoryBrowser.tsx');

    expect(changesSrc).toContain("import { GitDiffDialog } from './GitDiffDialog';");
    expect(branchesSrc).toContain("import { GitDiffDialog } from './GitDiffDialog';");
    expect(historySrc).toContain("import { GitDiffDialog } from './GitDiffDialog';");
    expect(branchesSrc).not.toContain('The selected file patch stays in the main detail surface');
    expect(historySrc).not.toContain('The selected file patch stays in the main detail surface');
  });

  it('uses the dedicated git view navigation inside the git workspace shell', () => {
    const src = read('./GitWorkspace.tsx');

    expect(src).toContain("import { GitViewNav } from './GitViewNav';");
    expect(src).toContain('navigationLabel="View"');
    expect(src).toContain('<GitViewNav');
  });

  it('lets the files activity control page-level mobile sidebars without rendering an inner activity bar', () => {
    const envSrc = read('../EnvAppShell.tsx');
    const browserSrc = read('./RemoteFileBrowser.tsx');

    expect(envSrc).toContain('filesSidebarOpen: filesMobileSidebarOpen');
    expect(envSrc).toContain('toggleFilesSidebar: toggleFilesMobileSidebar');
    expect(envSrc).toContain("layout.setSidebarActiveTab('files', { openSidebar: false });");
    expect(browserSrc).toContain("mobileSidebarToggleMode={props.widgetId ? 'internal' : 'external'}");
    expect(browserSrc).toContain('ctx.filesSidebarOpen()');
    expect(browserSrc).toContain('ctx.setFilesSidebarOpen(open);');
  });

  it('keeps the git content header focused on context and refresh only', () => {
    const src = read('./GitWorkbench.tsx');

    expect(src).toContain('Refresh');
    expect(src).toContain('subviewLabel(props.subview)');
    expect(src).not.toContain('GitHistoryModeSwitch');
    expect(src).not.toContain('GitSubviewSwitch');
    expect(src).not.toContain('Open browser sidebar');
  });
});
