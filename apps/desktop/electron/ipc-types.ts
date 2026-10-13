import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';

export interface RecordingFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  isUploaded: boolean;
  storageStatus: ClipMetadata['storageStatus'];
  uploadedUrl?: string;
}

export interface AuthSession {
  authenticated: boolean;
  username?: string;
}

export interface PublicConfig {
  storage: {
    maxLocalBytes: number;
    maxCloudBytes: number;
  };
}

export type RecordingDeleteScope = 'local' | 'cloud' | 'both';

export interface EquipmentCamera {
  id: string;
  name: string;
  deviceId: string;
  isActive: boolean;
}

export interface EquipmentButton {
  id: string;
  name: string;
  type: 'virtual' | 'gpio';
  isActive: boolean;
  gpioPin?: number;
  gpioChip?: string;
  activeLow?: boolean;
}

export interface EquipmentBinding {
  buttonId: string;
  cameraIds: string[];
}

export interface EquipmentConfig {
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: EquipmentBinding[];
}

export interface DiscoveredCamera {
  name: string;
  deviceId: string;
}

export interface GpioValidationResult {
  ok: boolean;
  message: string;
}

export interface DesktopApi {
  getAuthSession(): Promise<AuthSession>;
  login(username: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getPublicConfig(): Promise<PublicConfig>;
  getSnapshot(): Promise<ApplicationSnapshot>;
  getPreviewFrame(): Promise<{ imageDataUrl?: string; updatedAt?: number }>;
  triggerClip(): Promise<void>;
  retryUpload(clipId: string): Promise<void>;
  getRecordings(): Promise<RecordingFile[]>;
  deleteRecordings(ids: string[], scope: RecordingDeleteScope): Promise<{ deletedIds: string[]; errors: Array<{ id: string; error: string }> }>;
  openRecording(filePath: string): Promise<void>;
  getEquipmentConfig(): Promise<EquipmentConfig>;
  saveEquipmentConfig(config: EquipmentConfig): Promise<EquipmentConfig>;
  discoverCameras(): Promise<{ cameras: DiscoveredCamera[] }>;
  validateGpioPin(pin: number, chip?: string): Promise<GpioValidationResult>;
  onStatusChange(callback: (status: ApplicationStatus) => void): () => void;
  onClipsChange(callback: (clips: ClipMetadata[]) => void): () => void;
}
