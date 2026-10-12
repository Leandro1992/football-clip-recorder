import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from './interfaces';

export interface DiskStats {
  freeBytes: number;
}

export interface StorageRetentionOptions {
  directory: string;
  /** Share of the disk space available to clips (free space + space already used by clips). */
  maxPercent: number;
  logger: Logger;
  isUploaded?: (filePath: string) => boolean;
  getDiskStats?: (directory: string) => Promise<DiskStats>;
}

export interface RetentionResult {
  budgetBytes: number;
  usedBytes: number;
  removed: string[];
}

interface ClipFile {
  fullPath: string;
  size: number;
  modifiedAt: number;
}

async function defaultDiskStats(directory: string): Promise<DiskStats> {
  const stats = await fs.statfs(directory);
  return { freeBytes: Number(stats.bavail) * Number(stats.bsize) };
}

export class StorageRetention {
  constructor(private readonly options: StorageRetentionOptions) {}

  /** Deletes the oldest clips (uploaded ones first) until clips fit in the configured disk budget. */
  async enforce(): Promise<RetentionResult> {
    const { directory, logger } = this.options;
    const files = await this.listClips();
    const usedBytes = files.reduce((total, file) => total + file.size, 0);
    const { freeBytes } = await (this.options.getDiskStats ?? defaultDiskStats)(directory);
    const budgetBytes = Math.floor(((freeBytes + usedBytes) * this.options.maxPercent) / 100);
    const removed: string[] = [];

    if (usedBytes <= budgetBytes) {
      return { budgetBytes, usedBytes, removed };
    }

    const oldestFirst = files.sort((left, right) => left.modifiedAt - right.modifiedAt);
    const isUploaded = this.options.isUploaded ?? (() => true);
    const candidates = [
      ...oldestFirst.filter((file) => isUploaded(file.fullPath)),
      ...oldestFirst.filter((file) => !isUploaded(file.fullPath)),
    ];

    let remaining = usedBytes;
    for (const file of candidates) {
      if (remaining <= budgetBytes) {
        break;
      }
      const uploaded = isUploaded(file.fullPath);
      await fs.rm(file.fullPath, { force: true });
      remaining -= file.size;
      removed.push(file.fullPath);
      logger[uploaded ? 'info' : 'warn']('CLIP_EVICTED', {
        path: file.fullPath,
        sizeBytes: file.size,
        uploaded,
      });
    }

    return { budgetBytes, usedBytes: remaining, removed };
  }

  private async listClips(): Promise<ClipFile[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(this.options.directory, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: ClipFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp4')) {
        continue;
      }
      const fullPath = path.join(this.options.directory, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        files.push({ fullPath, size: stat.size, modifiedAt: stat.mtimeMs });
      } catch {
        // File vanished between readdir and stat.
      }
    }
    return files;
  }
}
