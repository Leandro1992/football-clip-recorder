import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from './types';
import type { ClipRecorderApplication } from './clip-recorder-application';
import type { Logger } from './interfaces';

export interface RecordingLane {
  cameraId: string;
  application: ClipRecorderApplication;
}

export function aggregateStatus(statuses: ApplicationStatus[]): ApplicationStatus {
  if (statuses.length === 0) {
    return {
      cameraStatus: 'offline',
      bufferStatus: 'empty',
      processingStatus: 'idle',
      uploadStatus: 'idle',
      availableBufferSeconds: 0,
      canTrigger: false,
    };
  }

  const anyOnline = statuses.some((status) => status.cameraStatus === 'online');
  const anyError = statuses.some((status) => status.cameraStatus === 'error');
  const processingStatus = statuses.some((status) => status.processingStatus === 'capturing-post-event')
    ? 'capturing-post-event'
    : statuses.some((status) => status.processingStatus === 'building-clip')
      ? 'building-clip'
      : statuses.some((status) => status.processingStatus === 'error')
        ? 'error'
        : 'idle';
  const uploadStatus = statuses.some((status) => status.uploadStatus === 'uploading')
    ? 'uploading'
    : statuses.some((status) => status.uploadStatus === 'error')
      ? 'error'
      : 'idle';
  const availableBufferSeconds = Math.max(...statuses.map((status) => status.availableBufferSeconds));
  const bufferStatus = statuses.some((status) => status.bufferStatus === 'ready')
    ? 'ready'
    : statuses.some((status) => status.bufferStatus === 'filling')
      ? 'filling'
      : 'empty';
  const messages = statuses.map((status) => status.lastMessage).filter((message): message is string => Boolean(message));

  return {
    cameraStatus: anyOnline ? 'online' : anyError ? 'error' : statuses[0].cameraStatus,
    bufferStatus,
    processingStatus,
    uploadStatus,
    availableBufferSeconds,
    canTrigger: statuses.some((status) => status.canTrigger),
    lastMessage: messages.length > 0 ? messages.join(' · ') : undefined,
  };
}

/** Several camera recorders seen by the UI as one application. */
export class RecordingFleet {
  private readonly statusListeners = new Set<(status: ApplicationStatus) => void>();
  private readonly clipListeners = new Set<(clips: ClipMetadata[]) => void>();

  constructor(
    private readonly lanes: RecordingLane[],
    private readonly logger?: Logger,
  ) {
    for (const lane of lanes) {
      lane.application.onStatusChange(() => this.emitStatus());
      lane.application.onClipsChange(() => this.emitClips());
    }
  }

  async trigger(cameraIds: string[]): Promise<void> {
    const ids = cameraIds.length > 0 ? cameraIds : this.lanes.map((lane) => lane.cameraId);
    await Promise.all(
      ids.map(async (cameraId) => {
        const lane = this.lanes.find((item) => item.cameraId === cameraId);
        if (!lane) {
          return;
        }

        try {
          await lane.application.manualTrigger();
        } catch (error) {
          this.logger?.error('LANE_TRIGGER_FAILED', {
            cameraId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  getSnapshot(): ApplicationSnapshot {
    const snapshots = this.lanes.map((lane) => lane.application.getSnapshot());
    const clips = new Map<string, ClipMetadata>();
    for (const snapshot of snapshots) {
      for (const clip of snapshot.clips) {
        clips.set(clip.id, clip);
      }
    }

    return {
      status: aggregateStatus(snapshots.map((snapshot) => snapshot.status)),
      clips: [...clips.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    };
  }

  onStatusChange(callback: (status: ApplicationStatus) => void): void {
    this.statusListeners.add(callback);
    callback(this.getSnapshot().status);
  }

  onClipsChange(callback: (clips: ClipMetadata[]) => void): void {
    this.clipListeners.add(callback);
    callback(this.getSnapshot().clips);
  }

  retryUpload(clipId: string): void {
    for (const lane of this.lanes) {
      if (lane.application.getSnapshot().clips.some((clip) => clip.id === clipId)) {
        lane.application.retryUpload(clipId);
      }
    }
  }

  async deleteClip(
    clipId: string,
    options: { deleteLocal: boolean; deleteCloud: boolean },
  ): Promise<void> {
    let deleted = false;
    for (const lane of this.lanes) {
      if (!lane.application.getSnapshot().clips.some((clip) => clip.id === clipId)) {
        continue;
      }
      await lane.application.deleteClip(clipId, options);
      deleted = true;
    }

    if (!deleted) {
      throw new Error('Clipe não encontrado.');
    }
  }

  forgetClipFiles(filePaths: string[]): void {
    for (const lane of this.lanes) {
      lane.application.forgetClipFiles(filePaths);
    }
  }

  setRecordingEnabled(enabled: boolean, disabledMessage?: string): void {
    for (const lane of this.lanes) {
      lane.application.setRecordingEnabled(enabled, disabledMessage);
    }
  }

  setUploadsPaused(paused: boolean): void {
    for (const lane of this.lanes) {
      lane.application.setUploadsPaused(paused);
    }
  }

  restoreClip(clip: ClipMetadata): void {
    this.lanes[0]?.application.restoreClip(clip);
  }

  retryFailedUploads(): void {
    for (const lane of this.lanes) {
      lane.application.retryFailedUploads();
    }
  }

  private emitStatus(): void {
    const status = this.getSnapshot().status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private emitClips(): void {
    const clips = this.getSnapshot().clips;
    for (const listener of this.clipListeners) {
      listener(clips);
    }
  }
}
