// File preview helpers: extension classification and basic content sniffing.

export type PreviewMode = 'text' | 'image' | 'pdf' | 'docx' | 'xlsx' | 'binary' | 'unsupported';

export const TEXT_PREVIEW_EXTENSIONS = [
  '.txt', '.text', '.log', '.md', '.markdown', '.readme',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config', '.env',
  '.html', '.htm', '.xml', '.xhtml', '.svg', '.css', '.scss', '.sass', '.less',
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.pyw', '.pyi', '.java', '.kt', '.scala',
  '.go', '.rs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.cs', '.vb', '.fs', '.fsx', '.fsi',
  '.php', '.rb', '.pl', '.pm', '.sh', '.bash', '.zsh', '.fish',
  '.swift', '.m', '.mm', '.r', '.sql', '.lua', '.dart',
  '.csv', '.tsv', '.psv',
  '.rst', '.asciidoc', '.adoc', '.tex', '.latex',
  '.dockerfile', '.gitignore', '.gitattributes', '.editorconfig',
  '.makefile', '.cmake', '.gradle', '.maven', '.pom',
] as const;

export const IMAGE_PREVIEW_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico',
  '.svg', '.tiff', '.tif', '.avif', '.heic', '.heif',
] as const;

export const PDF_PREVIEW_EXTENSIONS = ['.pdf'] as const;
export const DOCX_PREVIEW_EXTENSIONS = ['.docx'] as const;
export const XLSX_PREVIEW_EXTENSIONS = ['.xlsx', '.xls'] as const;

export function getExtDot(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx).toLowerCase();
}

export function isLikelyTextContent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;

  const sampleSize = Math.min(1024, bytes.length);
  let textBytes = 0;
  let controlBytes = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    const byte = bytes[i];
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textBytes += 1;
      continue;
    }
    if (byte >= 128) {
      textBytes += 1;
      continue;
    }
    controlBytes += 1;
  }

  const textRatio = textBytes / sampleSize;
  const controlRatio = controlBytes / sampleSize;
  return textRatio > 0.95 && controlRatio < 0.05;
}

export function previewModeByName(name: string): PreviewMode {
  const ext = getExtDot(name);
  if (PDF_PREVIEW_EXTENSIONS.includes(ext as any)) return 'pdf';
  if (DOCX_PREVIEW_EXTENSIONS.includes(ext as any)) return 'docx';
  if (XLSX_PREVIEW_EXTENSIONS.includes(ext as any)) return 'xlsx';
  if (IMAGE_PREVIEW_EXTENSIONS.includes(ext as any)) return 'image';
  if (TEXT_PREVIEW_EXTENSIONS.includes(ext as any)) return 'text';
  return 'binary';
}

export function mimeFromExtDot(ext: string): string | undefined {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    default:
      return undefined;
  }
}
