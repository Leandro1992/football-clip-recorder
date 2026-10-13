import fs from 'node:fs/promises';
import path from 'node:path';
import type { ClipMetadata, ClipStorage, Logger, UploadResult } from '@football-clip-recorder/core';

export interface MockStorageOptions {
  rootDirectory: string;
  logger: Logger;
  latencyMs?: number;
  maxRetainedClips?: number;
  maxRetainedBytes?: number;
}

export class MockStorage implements ClipStorage {
  constructor(private readonly options: MockStorageOptions) {}

  async upload(filePath: string, metadata: ClipMetadata): Promise<UploadResult> {
    await fs.mkdir(this.options.rootDirectory, { recursive: true });

    this.options.logger.info('UPLOAD_STARTED', {
      clipId: metadata.id,
      provider: 'mock',
      sourcePath: filePath,
    });

    await delay(this.options.latencyMs ?? 350);

    const fileName = path.basename(filePath);
    const destinationPath = path.join(this.options.rootDirectory, fileName);
    await fs.copyFile(filePath, destinationPath);

    this.options.logger.info('UPLOAD_COMPLETED', {
      clipId: metadata.id,
      provider: 'mock',
      destinationPath,
    });

    if (this.options.maxRetainedBytes) {
      await pruneOldClipsByBytes(
        this.options.rootDirectory,
        this.options.maxRetainedBytes,
        this.options.logger,
      );
    } else {
      const retain = this.options.maxRetainedClips ?? 5;
      await pruneOldClipsByCount(this.options.rootDirectory, retain, this.options.logger);
    }

    return {
      provider: 'mock',
      url: `mock-s3://${fileName}`,
    };
  }

  async delete(uploadedUrl: string): Promise<void> {
    const prefix = 'mock-s3://';
    if (!uploadedUrl.startsWith(prefix)) {
      return;
    }

    const fileName = uploadedUrl.slice(prefix.length);
    if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
      return;
    }

    await fs.rm(path.join(this.options.rootDirectory, fileName), { force: true });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pruneOldClipsByCount(directory: string, keep: number, logger: Logger): Promise<void> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
        .map(async (entry) => {
          const fullPath = path.join(directory, entry.name);
          return { fullPath, modifiedAt: (await fs.stat(fullPath)).mtimeMs };
        }),
    );

    files.sort((left, right) => right.modifiedAt - left.modifiedAt);
    for (const file of files.slice(keep)) {
      await fs.rm(file.fullPath, { force: true });
      logger.info('CLIP_PRUNED', { path: file.fullPath });
    }
  } catch {
    // Pruning is best effort and must never fail an upload.
  }
}

async function pruneOldClipsByBytes(directory: string, maxBytes: number, logger: Logger): Promise<void> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
        .map(async (entry) => {
          const fullPath = path.join(directory, entry.name);
          const stat = await fs.stat(fullPath);
          return { fullPath, modifiedAt: stat.mtimeMs, size: stat.size };
        }),
    );

    let total = files.reduce((sum, file) => sum + file.size, 0);
    if (total <= maxBytes) {
      return;
    }

    const oldestFirst = files.sort((left, right) => left.modifiedAt - right.modifiedAt);
    let remainingCount = oldestFirst.length;
    for (const file of oldestFirst) {
      if (total <= maxBytes || remainingCount <= 1) {
        break;
      }
      await fs.rm(file.fullPath, { force: true });
      remainingCount -= 1;
      total -= file.size;
      logger.info('CLIP_PRUNED', { path: file.fullPath, sizeBytes: file.size });
    }
  } catch {
    // Pruning is best effort and must never fail an upload.
  }
}