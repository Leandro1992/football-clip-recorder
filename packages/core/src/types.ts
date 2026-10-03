export type CameraStatus = 'offline' | 'starting' | 'online' | 'error';
export type BufferStatus = 'empty' | 'filling' | 'ready';
export type ProcessingStatus = 'idle' | 'capturing-post-event' | 'building-clip' | 'error';
export type UploadStatus = 'idle' | 'uploading' | 'error';
export type ClipStorageStatus = 'pending' | 'uploading' | 'uploaded';

export interface BufferedVideoSegment {
  id: string;
  sequence: number;
  filePath: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

export interface ClipMetadata {
  id: string;
  timestamp: string;
  duration: number;
  cameraId: string;
  filePath: string;
  storageStatus: ClipStorageStatus;
  uploadedUrl?: string;
  lastError?: string;
}

export interface UploadResult {
  url: string;
  provider: string;
}

export interface ApplicationStatus {
  cameraStatus: CameraStatus;
  bufferStatus: BufferStatus;
  processingStatus: ProcessingStatus;
  uploadStatus: UploadStatus;
  availableBufferSeconds: number;
  canTrigger: boolean;
  lastMessage?: string;
}

export interface ApplicationSnapshot {
  status: ApplicationStatus;
  clips: ClipMetadata[];
}

export interface BuildClipInput {
  clipId: string;
  targetStart: Date;
  targetEnd: Date;
  outputDirectory: string;
  segments: BufferedVideoSegment[];
}
