import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';
import type {
  Court,
  CourtCloud,
  EquipmentBinding,
  EquipmentButton,
  EquipmentCamera,
  EquipmentConfig,
} from '@football-clip-recorder/core';
import type {
  HealthLevel,
  HostHealthReport,
  NetworkStatus,
  UpdateStartResult,
  VersionStatus,
  WifiConnectResult,
  WifiNetwork,
  WifiScan,
} from '@football-clip-recorder/hardware';

export type {
  HealthLevel,
  HostHealthReport,
  NetworkStatus,
  UpdateStartResult,
  VersionStatus,
  WifiConnectResult,
  WifiNetwork,
  WifiScan,
};

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
  preview: {
    width: number;
    intervalSeconds: number;
  };
}

export type RecordingDeleteScope = 'local' | 'cloud' | 'both';

export type {
  Court,
  CourtCloud,
  EquipmentBinding,
  EquipmentButton,
  EquipmentCamera,
  EquipmentConfig,
};

export interface DiscoveredCamera {
  name: string;
  deviceId: string;
}

export interface GpioValidationResult {
  ok: boolean;
  message: string;
}

export interface LivePreviewCard {
  key: string;
  cameraId?: string;
  deviceId?: string;
  title: string;
  buttonNames: string[];
  source: 'recording' | 'preview';
  imageDataUrl?: string;
  updatedAt?: number;
  status: 'offline' | 'starting' | 'online' | 'error' | 'waiting';
  message?: string;
}

export interface DesktopApi {
  getAuthSession(): Promise<AuthSession>;
  login(username: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getPublicConfig(): Promise<PublicConfig>;
  getSnapshot(): Promise<ApplicationSnapshot>;
  getPreviewFrame(): Promise<{ imageDataUrl?: string; updatedAt?: number }>;
  getLiveView(): Promise<{ cards: LivePreviewCard[] }>;
  getHostHealth(): Promise<HostHealthReport>;
  triggerClip(): Promise<void>;
  retryUpload(clipId: string): Promise<void>;
  getRecordings(): Promise<RecordingFile[]>;
  deleteRecordings(ids: string[], scope: RecordingDeleteScope): Promise<{ deletedIds: string[]; errors: Array<{ id: string; error: string }> }>;
  openRecording(filePath: string): Promise<void>;
  getEquipmentConfig(): Promise<EquipmentConfig>;
  saveEquipmentConfig(config: EquipmentConfig): Promise<EquipmentConfig>;
  discoverCameras(): Promise<{ cameras: DiscoveredCamera[] }>;
  validateGpioPin(pin: number, chip?: string): Promise<GpioValidationResult>;
  getNetworkStatus(): Promise<NetworkStatus>;
  scanWifi(): Promise<WifiScan>;
  connectVenueWifi(ssid: string, password: string): Promise<WifiConnectResult>;
  getVersionStatus(): Promise<VersionStatus>;
  startUpdate(): Promise<UpdateStartResult>;
  onStatusChange(callback: (status: ApplicationStatus) => void): () => void;
  onClipsChange(callback: (clips: ClipMetadata[]) => void): () => void;
}
