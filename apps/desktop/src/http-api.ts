import type { ApplicationSnapshot, ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';
import type { DesktopApi, RecordingFile } from '../electron/ipc-types';

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
    getSnapshot: () => request<ApplicationSnapshot>('/api/snapshot'),
    getPreviewFrame: () => request<{ imageDataUrl?: string; updatedAt?: number }>('/api/preview-frame'),
    async triggerClip() {
      await request('/api/trigger', { method: 'POST' });
    },
    async retryUpload(clipId: string) {
      await request(`/api/clips/${encodeURIComponent(clipId)}/retry`, { method: 'POST' });
    },
    getRecordings: () => request<RecordingFile[]>('/api/recordings'),
    async openRecording(url: string) {
      window.open(url, '_blank', 'noopener');
    },
    onStatusChange: (callback: (status: ApplicationStatus) => void) => subscribe('status', callback),
    onClipsChange: (callback: (clips: ClipMetadata[]) => void) => subscribe('clips', callback),
  };
}
