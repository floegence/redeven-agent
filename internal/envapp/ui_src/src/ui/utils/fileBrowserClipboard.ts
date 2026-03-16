import type { FileItem } from '@floegence/floe-webapp-core/file-browser';
import { writeTextToClipboard } from './clipboard';

export type CopiedFileBrowserNamesResult = {
  count: number;
  firstName: string;
};

export async function copyFileBrowserItemNames(items: FileItem[]): Promise<CopiedFileBrowserNamesResult> {
  const names = items
    .map((item) => String(item.name ?? '').trim())
    .filter((name) => name.length > 0);

  if (names.length <= 0) {
    throw new Error('No file or folder name available to copy.');
  }

  await writeTextToClipboard(names.join('\n'));

  return {
    count: names.length,
    firstName: names[0]!,
  };
}

export function describeCopiedFileBrowserItemNames(result: CopiedFileBrowserNamesResult): string {
  if (result.count === 1) {
    return `"${result.firstName}" copied to clipboard.`;
  }
  return `${result.count} names copied to clipboard.`;
}
