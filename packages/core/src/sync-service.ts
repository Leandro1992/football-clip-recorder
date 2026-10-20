import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConnectivityMonitor } from './connectivity-monitor';
import type { ClipMetadata } from './types';
import type { Logger } from './interfaces';

export interface SyncControlledRecorder {
  setUploadsPaused(paused: boolean): void;
  onClipsChange(callback: (clips: ClipMetadata[]) => void): void;
  restoreClip(clip: ClipMetadata): void;
  retryFailedUploads(): void;
}

export interface SyncServiceOptions {
  application: SyncControlledRecorder;
  monitor: ConnectivityMonitor;
  clipsRoot: string;
  stateFilePath: string;
  retryIntervalMs: number;
  logger: Logger;
}

type SyncState = Record<string, { uploadedUrl: string }>;

/**
 * Keeps clips synchronized with the cloud provider: uploads are paused while offline,
 * resume (and failed ones are retried) when the connection returns, and the sync state
 * survives restarts via a small JSON file.
 */
export class SyncService {
  private state: SyncState = {};
  private retryTimer?: NodeJS.Timeout;
  private saving = Promise.resolve();

  constructor(private readonly options: SyncServiceOptions) {}

  async start(): Promise<void> {
    const { application, monitor, logger } = this.options;
    this.state = await this.loadState();

    application.setUploadsPaused(true);
    await this.restoreClipsFromDisk();

    application.onClipsChange((clips) => this.persist(clips));
    monitor.onChange((online) => {
      logger.info(online ? 'SYNC_ONLINE' : 'SYNC_OFFLINE');
      application.setUploadsPaused(!online);
      if (online) {
        application.retryFailedUploads();
      }
    });
    monitor.start();

    this.retryTimer = setInterval(() => {
      if (monitor.isOnline()) {
        application.retryFailedUploads();
      }
    }, this.options.retryIntervalMs);
    this.retryTimer.unref();
  }

  stop(): void {
    this.options.monitor.stop();
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  isUploaded(filePath: string): boolean {
    return path.basename(filePath) in this.state;
  }

  private async restoreClipsFromDisk(): Promise<void> {
    const { clipsRoot, application, logger } = this.options;
    const entries = await fs.readdir(clipsRoot, { withFileTypes: true }).catch(() => []);
    const restored: ClipMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp4')) {
        continue;
      }
      const filePath = path.join(clipsRoot, entry.name);
      const stat = await fs.stat(filePath);
      const synced = this.state[entry.name];
      restored.push({
        id: path.basename(entry.name, path.extname(entry.name)),
        timestamp: stat.mtime.toISOString(),
        duration: 0,
        cameraId: 'unknown',
        filePath,
        storageStatus: synced ? 'uploaded' : 'pending',
        uploadedUrl: synced?.uploadedUrl,
      });
    }

    restored.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    for (const clip of restored) {
      application.restoreClip(clip);
    }
    logger.info('SYNC_RESTORED_CLIPS', {
      total: restored.length,
      pending: restored.filter((clip) => clip.storageStatus === 'pending').length,
    });
  }

  private persist(clips: ClipMetadata[]): void {
    let changed = false;
    for (const clip of clips) {
      const key = path.basename(clip.filePath);
      if (clip.storageStatus === 'uploaded' && clip.uploadedUrl && !this.state[key]) {
        this.state[key] = { uploadedUrl: clip.uploadedUrl };
        changed = true;
      }
    }

    const existing = new Set(clips.map((clip) => path.basename(clip.filePath)));
    for (const key of Object.keys(this.state)) {
      if (!existing.has(key)) {
        delete this.state[key];
        changed = true;
      }
    }

    if (changed) {
      const payload = JSON.stringify(this.state, null, 2);
      this.saving = this.saving
        .then(() => fs.writeFile(this.options.stateFilePath, payload))
        .catch((error: unknown) =>
          this.options.logger.error('SYNC_STATE_WRITE_FAILED', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
    }
  }

  private async loadState(): Promise<SyncState> {
    try {
      return JSON.parse(await fs.readFile(this.options.stateFilePath, 'utf8')) as SyncState;
    } catch {
      return {};
    }
  }
}
