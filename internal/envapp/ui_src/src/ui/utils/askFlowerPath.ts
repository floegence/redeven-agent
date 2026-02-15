export function normalizeVirtualPath(path: string): string {
  const raw = String(path ?? '').trim();
  if (!raw) return '/';

  const withSlashes = raw.replace(/\\+/g, '/');
  const prefixed = withSlashes.startsWith('/') ? withSlashes : `/${withSlashes}`;
  const collapsed = prefixed.replace(/\/+/g, '/');

  if (collapsed === '/') return '/';
  return collapsed.endsWith('/') ? collapsed.replace(/\/+$/, '') || '/' : collapsed;
}

export function normalizeAbsolutePath(path: string): string {
  const raw = String(path ?? '').trim();
  if (!raw) return '';

  const withSlashes = raw.replace(/\\+/g, '/');
  if (!withSlashes.startsWith('/')) return '';
  const collapsed = withSlashes.replace(/\/+/g, '/');

  if (collapsed === '/') return '/';
  return collapsed.endsWith('/') ? collapsed.replace(/\/+$/, '') || '/' : collapsed;
}

function dirname(path: string): string {
  const normalized = String(path ?? '').trim() || '/';
  if (normalized === '/') return '/';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '/';
  return normalized.slice(0, idx) || '/';
}

export function dirnameVirtual(path: string): string {
  const normalized = normalizeVirtualPath(path);
  return dirname(normalized);
}

export function dirnameAbsolute(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  if (!normalized) return '';
  return dirname(normalized);
}

function splitPath(path: string): string[] {
  const normalized = String(path ?? '').trim() || '/';
  if (normalized === '/') return [];
  return normalized.slice(1).split('/').filter(Boolean);
}

function commonAncestor(paths: string[], normalize: (path: string) => string, fallback: string): string {
  const normalized = paths.map((it) => normalize(it)).filter((it) => it);

  if (normalized.length <= 0) return fallback;
  if (normalized.length === 1) return normalized[0] ?? fallback;

  const firstParts = splitPath(normalized[0] ?? fallback);
  let keep = firstParts.length;

  for (let i = 1; i < normalized.length; i += 1) {
    const parts = splitPath(normalized[i] ?? fallback);
    keep = Math.min(keep, parts.length);
    for (let j = 0; j < keep; j += 1) {
      if (firstParts[j] !== parts[j]) {
        keep = j;
        break;
      }
    }
    if (keep === 0) return fallback;
  }

  if (keep <= 0) return fallback;
  return `/${firstParts.slice(0, keep).join('/')}`;
}

export function commonAncestorVirtual(paths: string[]): string {
  return commonAncestor(paths, normalizeVirtualPath, '/');
}

export function commonAncestorAbsolute(paths: string[]): string {
  return commonAncestor(paths, normalizeAbsolutePath, '/');
}

function deriveWorkingDir(
  items: Array<{ path: string; isDirectory: boolean }>,
  options: {
    normalize: (path: string) => string;
    dirname: (path: string) => string;
    commonAncestor: (paths: string[]) => string;
    fallback: string;
  },
): string {
  if (items.length <= 0) {
    return options.normalize(options.fallback);
  }

  const dirs = items
    .map((item) => {
      const normalizedPath = options.normalize(item.path);
      if (item.isDirectory) return normalizedPath;
      return options.dirname(normalizedPath);
    })
    .filter((it) => it);

  if (dirs.length <= 0) {
    return options.normalize(options.fallback);
  }

  if (dirs.length === 1) {
    return options.normalize(dirs[0] ?? options.fallback);
  }

  return options.commonAncestor(dirs);
}

export function deriveVirtualWorkingDirFromItems(
  items: Array<{ path: string; isDirectory: boolean }>,
  fallback = '/',
): string {
  return deriveWorkingDir(items, {
    normalize: normalizeVirtualPath,
    dirname: dirnameVirtual,
    commonAncestor: commonAncestorVirtual,
    fallback,
  });
}

export function deriveAbsoluteWorkingDirFromItems(
  items: Array<{ path: string; isDirectory: boolean }>,
  fallback = '/',
): string {
  return deriveWorkingDir(items, {
    normalize: normalizeAbsolutePath,
    dirname: dirnameAbsolute,
    commonAncestor: commonAncestorAbsolute,
    fallback,
  });
}

export function virtualPathToAbsolutePath(virtualPath: string, fsRootAbs: string): string {
  const root = normalizeAbsolutePath(fsRootAbs);
  if (!root) return '';

  const normalizedVirtual = normalizeVirtualPath(virtualPath);
  if (normalizedVirtual === '/') return root;
  if (root === '/') return normalizedVirtual;
  return `${root}${normalizedVirtual}`;
}

export function absolutePathToVirtualPath(absolutePath: string, fsRootAbs: string): string {
  const root = normalizeAbsolutePath(fsRootAbs);
  const normalizedAbs = normalizeAbsolutePath(absolutePath);
  if (!root || !normalizedAbs) return '/';

  if (root === '/') {
    return normalizeVirtualPath(normalizedAbs);
  }
  if (normalizedAbs === root) return '/';
  if (!normalizedAbs.startsWith(`${root}/`)) return '/';
  return normalizeVirtualPath(normalizedAbs.slice(root.length));
}

export function resolveSuggestedWorkingDirAbsolute(params: {
  suggestedWorkingDirAbs?: string | null;
  suggestedWorkingDirVirtual?: string | null;
  fsRootAbs?: string | null;
  fallbackFsRootAbs?: string | null;
}): string {
  const explicitAbs = normalizeAbsolutePath(params.suggestedWorkingDirAbs ?? '');
  if (explicitAbs) return explicitAbs;

  const suggestedVirtual = String(params.suggestedWorkingDirVirtual ?? '').trim();
  if (!suggestedVirtual) return '';

  const root = normalizeAbsolutePath(params.fsRootAbs ?? '') || normalizeAbsolutePath(params.fallbackFsRootAbs ?? '');
  if (!root) return '';
  return virtualPathToAbsolutePath(suggestedVirtual, root);
}
