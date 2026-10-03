import type { ClipStorage, Logger } from './interfaces';
import type { ClipMetadata } from './types';

export interface UploadQueueState {
  pendingCount: number;
  processing: boolean;
  lastError?: string;
}

type ClipListener = (clip: ClipMetadata) => void;
type StateListener = (state: UploadQueueState) => void;

export class UploadQueue {
  private readonly clipListeners = new Set<ClipListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly pendingClips: ClipMetadata[] = [];
  private processing = false;
  private lastError?: string;

  constructor(
    private readonly storage: ClipStorage,
    private readonly logger: Logger,
  ) {}

  enqueue(clip: ClipMetadata): void {
    this.pendingClips.push({ ...clip, storageStatus: 'pending' });
    this.emitState();
    void this.pump();
  }

  retry(clip: ClipMetadata): void {
    this.enqueue({ ...clip, lastError: undefined });
  }

  onClipUpdated(callback: ClipListener): void {
    this.clipListeners.add(callback);
  }

  onStateChange(callback: StateListener): void {
    this.stateListeners.add(callback);
    callback(this.getState());
  }

  getState(): UploadQueueState {
    return {
      pendingCount: this.pendingClips.length,
      processing: this.processing,
      lastError: this.lastError,
    };
  }

  private async pump(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.emitState();

    while (this.pendingClips.length > 0) {
      const nextClip = this.pendingClips.shift();
      if (!nextClip) {
        break;
      }

      const uploadingClip: ClipMetadata = {
        ...nextClip,
        storageStatus: 'uploading',
      };
      this.emitClip(uploadingClip);
      this.logger.info('UPLOAD_STARTED', { clipId: uploadingClip.id, filePath: uploadingClip.filePath });

      try {
        const uploadResult = await this.storage.upload(uploadingClip.filePath, uploadingClip);
        this.lastError = undefined;
        const completedClip: ClipMetadata = {
          ...uploadingClip,
          storageStatus: 'uploaded',
          uploadedUrl: uploadResult.url,
        };
        this.emitClip(completedClip);
        this.logger.info('UPLOAD_COMPLETED', {
          clipId: completedClip.id,
          provider: uploadResult.provider,
          url: uploadResult.url,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown upload error';
        this.lastError = message;
        const pendingClip: ClipMetadata = {
          ...uploadingClip,
          storageStatus: 'pending',
          lastError: message,
        };
        this.emitClip(pendingClip);
        this.logger.error('UPLOAD_FAILED', { clipId: pendingClip.id, error: message });
      }

      this.emitState();
    }

    this.processing = false;
    this.emitState();
  }

  private emitClip(clip: ClipMetadata): void {
    for (const listener of this.clipListeners) {
      listener(clip);
    }
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
