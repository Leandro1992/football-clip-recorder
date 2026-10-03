import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from './ipc-types';
import type { ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';

const api: DesktopApi = {
  async getSnapshot() {
    return ipcRenderer.invoke('app:get-snapshot');
  },
  async getPreviewFrame() {
    return ipcRenderer.invoke('app:get-preview-frame');
  },
  async triggerClip() {
    await ipcRenderer.invoke('app:trigger');
  },
  async retryUpload(clipId: string) {
    await ipcRenderer.invoke('app:retry-upload', clipId);
  },
  async getRecordings() {
    return ipcRenderer.invoke('app:get-recordings');
  },
  async openRecording(filePath: string) {
    await ipcRenderer.invoke('app:open-recording', filePath);
  },
  onStatusChange(callback: (status: ApplicationStatus) => void) {
    const listener = (_event: Electron.IpcRendererEvent, status: ApplicationStatus) => {
      callback(status);
    };

    ipcRenderer.on('app:status', listener);
    return () => {
      ipcRenderer.removeListener('app:status', listener);
    };
  },
  onClipsChange(callback: (clips: ClipMetadata[]) => void) {
    const listener = (_event: Electron.IpcRendererEvent, clips: ClipMetadata[]) => {
      callback(clips);
    };

    ipcRenderer.on('app:clips', listener);
    return () => {
      ipcRenderer.removeListener('app:clips', listener);
    };
  },
};

contextBridge.exposeInMainWorld('desktopApi', api);
