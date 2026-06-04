import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RendererExportFormat, RendererProvider } from '@/lib/renderer-adapters';

export function canvaExportFormatForKind(kind: string): RendererExportFormat {
  const normalized = kind.toLowerCase();
  return normalized.includes('reel') ? 'mp4' : 'png';
}

export async function persistCanvaExportFile(
  exportUrl: string,
  designId: string,
  title = 'canva-export',
  format: RendererExportFormat | string = 'png',
  provider: RendererProvider = 'canva',
): Promise<string> {
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Canva export download failed ${response.status}.`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(`${designId}:${title}:${Date.now()}`).digest('hex').slice(0, 12);
  const extension = format === 'jpg' ? 'jpg' : format === 'pdf' ? 'pdf' : format === 'mp4' ? 'mp4' : 'png';
  const directory = path.join(process.cwd(), 'public', 'generated', provider);
  await mkdir(directory, { recursive: true });

  const fileName = `${sanitizeFileName(title)}-${hash}.${extension}`;
  await writeFile(path.join(directory, fileName), bytes);
  return `/generated/${provider}/${fileName}`;
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'canva-export';
}
