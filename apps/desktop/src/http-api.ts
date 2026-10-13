import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';
import type {
  DesktopApi,
  EquipmentConfig,
  PublicConfig,
  RecordingDeleteScope,
  RecordingFile,
} from '../electron/ipc-types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function subscribe<T>(eventName: 'status' | 'clips', callback: (payload: T) => void): () => void {
  // EventSource reconnects on its own and the server re-sends the current state on connect.
  const source = new EventSource('/api/events');
  source.addEventListener(eventName, (event) => {
    callback(JSON.parse((event as MessageEvent<string>).data) as T);
  });

  return () => source.close();
}

/** Same contract as the Electron preload bridge, backed by the headless Node server. */
export function createHttpApi(): DesktopApi {
  return {
    getAuthSession: () => request('/api/auth/session'),
    login: (username: string, password: string) =>
      request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    async logout() {
      await request('/api/auth/logout', { method: 'POST' });
    },
    getPublicConfig: () => request<PublicConfig>('/api/config'),
    getSnapshot: () => request<ApplicationSnapshot>('/api/snapshot'),
    getPreviewFrame: () => request<{ imageDataUrl?: string; updatedAt?: number }>('/api/preview-frame'),
    async triggerClip() {
      await request('/api/trigger', { method: 'POST' });
    },
    async retryUpload(clipId: string) {
      await request(`/api/clips/${encodeURIComponent(clipId)}/retry`, { method: 'POST' });
    },
    getRecordings: () => request<RecordingFile[]>('/api/recordings'),
    deleteRecordings: (ids: string[], scope: RecordingDeleteScope) =>
      request<{ deletedIds: string[]; errors: Array<{ id: string; error: string }> }>('/api/recordings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, scope }),
      }),
    async openRecording(url: string) {
      window.open(url, '_blank', 'noopener');
    },
    getEquipmentConfig: () => request<EquipmentConfig>('/api/equipment'),
    saveEquipmentConfig: (config: EquipmentConfig) =>
      request<{ config: EquipmentConfig }>('/api/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).then((response) => response.config),
    discoverCameras: () => request<{ cameras: { name: string; deviceId: string }[] }>('/api/equipment/discovery'),
    validateGpioPin: (pin: number, chip?: string) =>
      request<{ ok: boolean; message: string }>('/api/equipment/validate-gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, chip }),
      }),
    onStatusChange: (callback: (status: ApplicationStatus) => void) => subscribe('status', callback),
    onClipsChange: (callback: (clips: ClipMetadata[]) => void) => subscribe('clips', callback),
  };
}
