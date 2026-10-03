import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { loadConfig, ensureRuntimeDirectories } from '@football-clip-recorder/config';
import {
  ClipRecorderApplication,
  ConsoleLogger,
  type ApplicationStatus,
  type ClipMetadata,
} from '@football-clip-recorder/core';
import { resolveFfmpegPath, UsbCameraWindows } from '@football-clip-recorder/camera';
import { VirtualButton } from '@football-clip-recorder/hardware';
import { createClipStorage } from '@football-clip-recorder/storage';
import { ClipBuilder, VideoBuffer } from '@football-clip-recorder/video';

const logger = new ConsoleLogger();
const projectRoot = path.resolve(__dirname, '../../../..');
const config = loadConfig({ projectRoot });
ensureRuntimeDirectories(config);

const sessionDirectoryName = `session-${new Date().toISOString().replaceAll(':', '-')}`;
const segmentOutputDirectory = path.join(config.paths.segmentsRoot, sessionDirectoryName);
const previewImagePath = path.join(config.paths.previewRoot, `${sessionDirectoryName}.jpg`);

const camera = new UsbCameraWindows({
  outputDirectory: segmentOutputDirectory,
  previewImagePath,
  segmentDurationSeconds: config.video.segmentDurationSeconds,
  width: config.camera.width,
  height: config.camera.height,
  fps: config.camera.fps,
  format: config.camera.format,
  deviceName: config.camera.deviceName,
  audioDeviceName: config.camera.audioDeviceName,
  enableAudio: config.camera.enableAudio,
  ffmpegPath: config.app.ffmpegPath,
  logger,
});

const videoBuffer = new VideoBuffer({
  bufferDurationSeconds: config.video.bufferDurationSeconds,
  logger,
});

const clipBuilder = new ClipBuilder({
  tempDirectory: config.paths.tempRoot,
  ffmpegPath: config.app.ffmpegPath ?? resolveFfmpegPath(),
});

const triggerButton = new VirtualButton();
const clipStorage = createClipStorage(config, logger);

const clipRecorderApplication = new ClipRecorderApplication({
  config,
  camera,
  triggerButton,
  videoBuffer,
  clipBuilder,
  clipStorage,
  logger,
});

let mainWindow: BrowserWindow | undefined;

function sendToMainWindow(channel: 'app:status' | 'app:clips', payload: ApplicationStatus | ClipMetadata[]): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.resolve(__dirname, '../renderer/index.html'));
  }

  clipRecorderApplication.onStatusChange((status: ApplicationStatus) => {
    sendToMainWindow('app:status', status);
  });

  clipRecorderApplication.onClipsChange((clips: ClipMetadata[]) => {
    sendToMainWindow('app:clips', clips);
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-snapshot', () => {
    return clipRecorderApplication.getSnapshot();
  });

  ipcMain.handle('app:get-preview-frame', async () => {
    try {
      const file = await fs.readFile(previewImagePath);
      const stats = await fs.stat(previewImagePath);

      return {
        imageDataUrl: `data:image/jpeg;base64,${file.toString('base64')}`,
        updatedAt: stats.mtimeMs,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        return {};
      }

      throw error;
    }
  });

  ipcMain.handle('app:trigger', async () => {
    triggerButton.press();
  });

  ipcMain.handle('app:retry-upload', async (_event, clipId: string) => {
    clipRecorderApplication.retryUpload(clipId);
  });

  ipcMain.handle('app:get-recordings', async () => {
    const recordingsDirectory = config.paths.clipsRoot;
    const entries = await fs.readdir(recordingsDirectory, { withFileTypes: true });

    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
        .map(async (entry) => {
          const fullPath = path.join(recordingsDirectory, entry.name);
          const stats = await fs.stat(fullPath);
          const clip = clipRecorderApplication.getSnapshot().clips.find(
            (item) => path.basename(item.filePath) === entry.name,
          );

          return {
            id: clip?.id ?? entry.name,
            name: entry.name,
            path: fullPath,
            sizeBytes: stats.size,
            modifiedAt: stats.mtimeMs,
            isUploaded: clip?.storageStatus === 'uploaded',
          };
        }),
    );

    return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  });

  ipcMain.handle('app:open-recording', async (_event, filePath: string) => {
    await shell.openPath(filePath);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();
  void clipRecorderApplication.start().catch((error: unknown) => {
    logger.error('CAMERA_STARTUP_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void clipRecorderApplication.stop();
});
