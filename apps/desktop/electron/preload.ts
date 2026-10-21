import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, EquipmentConfig, RecordingDeleteScope } from './ipc-types';
import type { ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';

const api: DesktopApi = {
  async getAuthSession() {
    return ipcRenderer.invoke('app:get-auth-session');
  },
  async login(username: string, password: string) {
    return ipcRenderer.invoke('app:login', username, password);
  },
  async logout() {
    await ipcRenderer.invoke('app:logout');
  },
  async getPublicConfig() {
    return ipcRenderer.invoke('app:get-public-config');
  },
  async getSnapshot() {
    return ipcRenderer.invoke('app:get-snapshot');
  },
  async getPreviewFrame() {
    return ipcRenderer.invoke('app:get-preview-frame');
  },
  async getLiveView() {
    return ipcRenderer.invoke('app:get-live-view');
  },
  async getHostHealth() {
    return ipcRenderer.invoke('app:get-host-health');
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
  async deleteRecordings(ids: string[], scope: RecordingDeleteScope) {
    return ipcRenderer.invoke('app:delete-recordings', ids, scope);
  },
  async openRecording(filePath: string) {
    await ipcRenderer.invoke('app:open-recording', filePath);
  },
  async getEquipmentConfig() {
    return ipcRenderer.invoke('app:get-equipment-config');
  },
  async saveEquipmentConfig(config: EquipmentConfig) {
    return ipcRenderer.invoke('app:save-equipment-config', config);
  },
  async discoverCameras() {
    return ipcRenderer.invoke('app:discover-cameras');
  },
  async validateGpioPin(pin: number, chip?: string) {
    return ipcRenderer.invoke('app:validate-gpio-pin', pin, chip);
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
