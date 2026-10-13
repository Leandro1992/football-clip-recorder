import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { loadConfig, ensureRuntimeDirectories } from '@football-clip-recorder/config';
import {
  ClipRecorderApplication,
  ConsoleLogger,
  type ApplicationStatus,
  type ClipMetadata,
} from '@football-clip-recorder/core';
import { listCameraDevices, resolveFfmpegPath, UsbCameraWindows } from '@football-clip-recorder/camera';
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
const equipmentConfigPath = path.join(config.paths.runtimeRoot, 'equipment-config.json');
let authenticated = false;

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
  ipcMain.handle('app:get-auth-session', () => ({
    authenticated,
    username: authenticated ? config.auth.username : undefined,
  }));

  ipcMain.handle('app:login', async (_event, username: string, password: string) => {
    if (username === config.auth.username && password === config.auth.password) {
      authenticated = true;
      return { authenticated: true, username };
    }
    throw new Error('Usuário ou senha inválidos.');
  });

  ipcMain.handle('app:logout', async () => {
    authenticated = false;
  });

  ipcMain.handle('app:get-public-config', () => ({
    storage: {
      maxLocalBytes: config.storage.maxDiskBytes,
      maxCloudBytes: config.storage.maxCloudBytes,
    },
  }));

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
            storageStatus: clip?.storageStatus ?? 'pending',
            uploadedUrl: clip?.uploadedUrl,
          };
        }),
    );

    return files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  });

  ipcMain.handle('app:delete-recordings', async (_event, ids: string[], scope: 'local' | 'cloud' | 'both') => {
    const deletedIds: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        await clipRecorderApplication.deleteClip(id, {
          deleteLocal: scope === 'local' || scope === 'both',
          deleteCloud: scope === 'cloud' || scope === 'both',
        });
        deletedIds.push(id);
      } catch (error) {
        errors.push({ id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { deletedIds, errors };
  });

  ipcMain.handle('app:open-recording', async (_event, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle('app:get-equipment-config', async () => {
    try {
      return JSON.parse(await fs.readFile(equipmentConfigPath, 'utf8'));
    } catch {
      return { cameras: [], buttons: [], bindings: [] };
    }
  });

  ipcMain.handle('app:save-equipment-config', async (_event, equipmentConfig: unknown) => {
    await fs.writeFile(equipmentConfigPath, JSON.stringify(equipmentConfig, null, 2));
    return equipmentConfig;
  });

  ipcMain.handle('app:discover-cameras', async () => {
    return { cameras: await listCameraDevices(config.app.ffmpegPath) };
  });

  ipcMain.handle('app:validate-gpio-pin', async (_event, pin: number) => {
    if (process.platform !== 'linux') {
      return { ok: false, message: 'Validação de GPIO disponível apenas no Linux.' };
    }
    return new Promise<{ ok: boolean; message: string }>((resolve) => {
      execFile('pinctrl', ['get', String(pin)], { timeout: 10_000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, message: stderr || error.message });
          return;
        }
        resolve({ ok: true, message: stdout.trim() });
      });
    });
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
