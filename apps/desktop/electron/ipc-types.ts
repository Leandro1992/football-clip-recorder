import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';

export interface RecordingFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  isUploaded: boolean;
}

export interface DesktopApi {
  getSnapshot(): Promise<ApplicationSnapshot>;
  getPreviewFrame(): Promise<{ imageDataUrl?: string; updatedAt?: number }>;
  triggerClip(): Promise<void>;
  retryUpload(clipId: string): Promise<void>;
  getRecordings(): Promise<RecordingFile[]>;
  openRecording(filePath: string): Promise<void>;
  onStatusChange(callback: (status: ApplicationStatus) => void): () => void;
  onClipsChange(callback: (clips: ClipMetadata[]) => void): () => void;
}
