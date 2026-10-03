import path from 'node:path';
import type { AppConfig } from '@football-clip-recorder/config';
import type {
  ClipStorage,
  Logger,
  SegmentingCamera,
  TriggerButton,
  VideoBufferPort,
  VideoClipBuilder,
} from './interfaces';
import { UploadQueue } from './upload-queue';
import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from './types';

type StatusListener = (status: ApplicationStatus) => void;
type ClipListener = (clips: ClipMetadata[]) => void;

export interface ClipRecorderApplicationDependencies {
  config: AppConfig;
  camera: SegmentingCamera;
  triggerButton: TriggerButton;
  videoBuffer: VideoBufferPort;
  clipBuilder: VideoClipBuilder;
  clipStorage: ClipStorage;
  logger: Logger;
}

export class ClipRecorderApplication {
  private readonly statusListeners = new Set<StatusListener>();
  private readonly clipListeners = new Set<ClipListener>();
  private readonly uploadQueue: UploadQueue;
  private readonly clips = new Map<string, ClipMetadata>();
  private started = false;

  private status: ApplicationStatus = {
    cameraStatus: 'offline',
    bufferStatus: 'empty',
    processingStatus: 'idle',
    uploadStatus: 'idle',
    availableBufferSeconds: 0,
    canTrigger: false,
  };

  constructor(private readonly dependencies: ClipRecorderApplicationDependencies) {
    this.uploadQueue = new UploadQueue(dependencies.clipStorage, dependencies.logger);
    this.registerCameraEvents();
    this.registerButtonEvents();
    this.registerUploadQueueEvents();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.status.cameraStatus = 'starting';
    this.emitStatus();

    await this.dependencies.triggerButton.start();

    try {
      await this.dependencies.camera.start();
    } catch (error) {
      this.status.cameraStatus = 'error';
      this.status.processingStatus = 'error';
      this.status.canTrigger = false;
      this.status.lastMessage = error instanceof Error ? error.message : 'Camera startup failed';
      this.emitStatus();
      throw error;
    }

    this.started = true;
    this.refreshBufferStatus();
  }

  async stop(): Promise<void> {
    await this.dependencies.triggerButton.stop();
    await this.dependencies.camera.stop();
    await Promise.resolve(this.dependencies.videoBuffer.clear());

    this.status = {
      ...this.status,
      cameraStatus: 'offline',
      processingStatus: 'idle',
      uploadStatus: 'idle',
      canTrigger: false,
      availableBufferSeconds: 0,
      bufferStatus: 'empty',
    };
    this.emitStatus();
    this.started = false;
  }

  async manualTrigger(): Promise<void> {
    await this.captureClip();
  }

  retryUpload(clipId: string): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.storageStatus !== 'pending') {
      return;
    }

    this.uploadQueue.retry(clip);
    this.status.lastMessage = 'Upload reenfileirado.';
    this.emitStatus();
  }

  getSnapshot(): ApplicationSnapshot {
    return {
      status: { ...this.status },
      clips: this.getSortedClips(),
    };
  }

  onStatusChange(callback: StatusListener): void {
    this.statusListeners.add(callback);
    callback({ ...this.status });
  }

  onClipsChange(callback: ClipListener): void {
    this.clipListeners.add(callback);
    callback(this.getSortedClips());
  }

  private registerCameraEvents(): void {
    this.dependencies.camera.onStatusChange((cameraStatus) => {
      this.status.cameraStatus = cameraStatus;
      this.status.canTrigger = this.computeCanTrigger();
      this.emitStatus();
    });

    this.dependencies.camera.onSegmentCreated((segment) => {
      void Promise.resolve(this.dependencies.videoBuffer.addSegment(segment)).then(() => {
        this.refreshBufferStatus();
      });
    });

    this.dependencies.camera.onError((error) => {
      this.status.cameraStatus = 'error';
      this.status.lastMessage = error.message;
      this.status.canTrigger = false;
      this.emitStatus();
    });
  }

  private registerButtonEvents(): void {
    this.dependencies.triggerButton.onPress(() => {
      void this.captureClip();
    });
  }

  private registerUploadQueueEvents(): void {
    this.uploadQueue.onClipUpdated((clip) => {
      this.upsertClip(clip);
    });

    this.uploadQueue.onStateChange((state) => {
      this.status.uploadStatus = state.processing ? 'uploading' : state.lastError ? 'error' : 'idle';
      if (state.lastError) {
        this.status.lastMessage = state.lastError;
      }
      this.emitStatus();
    });
  }

  private async captureClip(): Promise<void> {
    if (!this.computeCanTrigger()) {
      return;
    }

    const { config, logger, videoBuffer, clipBuilder, camera } = this.dependencies;
    const triggeredAt = new Date();
    const targetStart = new Date(
      triggeredAt.getTime() - config.video.bufferDurationSeconds * 1000,
    );
    const targetEnd = new Date(
      triggeredAt.getTime() + config.video.postEventDurationSeconds * 1000,
    );
    const clipId = this.createClipId(triggeredAt);

    this.status.processingStatus = 'capturing-post-event';
    this.status.canTrigger = false;
    this.status.lastMessage = 'Aguardando segmentos pós-evento...';
    this.emitStatus();

    logger.info('TRIGGER_RECEIVED', { clipId, triggeredAt: triggeredAt.toISOString() });

    try {
      await videoBuffer.waitForTime(targetEnd);

      this.status.processingStatus = 'building-clip';
      this.status.lastMessage = 'Montando clipe final...';
      this.emitStatus();

      const selectedSegments = videoBuffer.getSegmentsForInterval(targetStart, targetEnd);
      logger.info('CLIP_BUILD_STARTED', {
        clipId,
        segmentCount: selectedSegments.length,
        targetStart: targetStart.toISOString(),
        targetEnd: targetEnd.toISOString(),
      });

      const clipFilePath = await clipBuilder.buildClip({
        clipId,
        targetStart,
        targetEnd,
        outputDirectory: config.paths.clipsRoot,
        segments: selectedSegments,
      });

      const duration = selectedSegments.reduce(
        (total, segment) => total + segment.durationSeconds,
        0,
      );
      const clipMetadata: ClipMetadata = {
        id: clipId,
        timestamp: triggeredAt.toISOString(),
        duration,
        cameraId: camera.getCameraId(),
        filePath: path.resolve(clipFilePath),
        storageStatus: 'pending',
      };

      logger.info('CLIP_BUILD_COMPLETED', {
        clipId,
        outputFilePath: clipMetadata.filePath,
        duration,
      });

      this.upsertClip(clipMetadata);
      this.uploadQueue.enqueue(clipMetadata);

      this.status.processingStatus = 'idle';
      this.status.canTrigger = this.computeCanTrigger();
      this.status.lastMessage = 'Clipe criado e enfileirado para upload.';
      this.emitStatus();
    } catch (error) {
      this.status.processingStatus = 'error';
      this.status.canTrigger = this.status.cameraStatus === 'online';
      this.status.lastMessage = error instanceof Error ? error.message : 'Clip capture failed';
      this.emitStatus();
      throw error;
    }
  }

  private refreshBufferStatus(): void {
    const availableBufferSeconds = this.dependencies.videoBuffer.getAvailableDurationSeconds();

    this.status.availableBufferSeconds = Number(availableBufferSeconds.toFixed(1));
    this.status.bufferStatus =
      availableBufferSeconds === 0
        ? 'empty'
        : availableBufferSeconds >= this.dependencies.config.video.bufferDurationSeconds
          ? 'ready'
          : 'filling';
    this.status.canTrigger = this.computeCanTrigger();
    this.emitStatus();
  }

  private computeCanTrigger(): boolean {
    return this.status.cameraStatus === 'online' && this.status.processingStatus === 'idle';
  }

  private upsertClip(clip: ClipMetadata): void {
    this.clips.set(clip.id, clip);
    const list = this.getSortedClips();
    for (const listener of this.clipListeners) {
      listener(list);
    }
  }

  private getSortedClips(): ClipMetadata[] {
    return [...this.clips.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }

  private emitStatus(): void {
    const snapshot = { ...this.status };
    for (const listener of this.statusListeners) {
      listener(snapshot);
    }
  }

  private createClipId(triggeredAt: Date): string {
    return `clip-${triggeredAt.getTime()}`;
  }
}
