import type {
  BufferedVideoSegment,
  BuildClipInput,
  CameraStatus,
  ClipMetadata,
  UploadResult,
} from './types';

export interface Camera {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export interface SegmentingCamera extends Camera {
  getCameraId(): string;
  onSegmentCreated(callback: (segment: BufferedVideoSegment) => void): void;
  onStatusChange(callback: (status: CameraStatus) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface TriggerButton {
  start(): Promise<void>;
  stop(): Promise<void>;
  onPress(callback: () => void): void;
}

export interface ClipStorage {
  upload(filePath: string, metadata: ClipMetadata): Promise<UploadResult>;
}

export interface VideoBufferPort {
  addSegment(segment: BufferedVideoSegment): Promise<void> | void;
  getSegmentsForInterval(start: Date, end: Date): BufferedVideoSegment[];
  getAvailableDurationSeconds(referenceTime?: Date): number;
  waitForTime(targetTime: Date): Promise<void>;
  clear(): Promise<void> | void;
}

export interface VideoClipBuilder {
  buildClip(input: BuildClipInput): Promise<string>;
}

export interface Logger {
  info(event: string, payload?: Record<string, unknown>): void;
  warn(event: string, payload?: Record<string, unknown>): void;
  error(event: string, payload?: Record<string, unknown>): void;
}
