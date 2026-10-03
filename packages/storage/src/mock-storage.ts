import fs from 'node:fs/promises';
import path from 'node:path';
import type { ClipMetadata, ClipStorage, Logger, UploadResult } from '@football-clip-recorder/core';

export interface MockStorageOptions {
  rootDirectory: string;
  logger: Logger;
  latencyMs?: number;
  maxRetainedClips?: number;
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

    const retain = this.options.maxRetainedClips ?? 5;
    await pruneOldClips(this.options.rootDirectory, retain, this.options.logger);
    await pruneOldClips(path.dirname(filePath), retain, this.options.logger);

    return {
      provider: 'mock',
      url: `mock-s3://${fileName}`,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pruneOldClips(directory: string, keep: number, logger: Logger): Promise<void> {
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