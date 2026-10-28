import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ensureRuntimeDirectories } from '@football-clip-recorder/config';
import {
  cameraIdsForGpioPin,
  ClipRecorderApplication,
  ConnectivityMonitor,
  ConsoleLogger,
  RecordingFleet,
  StorageRetention,
  SyncService,
  type TriggerButton,
} from '@football-clip-recorder/core';
import {
  buildBoundCameraCards,
  listCameraDevices,
  readPreviewFrame,
  resolveFfmpegPath,
  selectLinkedCameras,
  UsbCameraLinux,
  UsbCameraWindows,
} from '@football-clip-recorder/camera';
import { CompositeTriggerButton, GpioButton, HostHealthMonitor, VirtualButton } from '@football-clip-recorder/hardware';
import { createClipStorage } from '@football-clip-recorder/storage';
import { ClipBuilder, VideoBuffer } from '@football-clip-recorder/video';
import { createHttpServer } from './http-server';
import { EquipmentStore, type EquipmentConfig } from './equipment-store';

const CAMERA_RETRY_DELAY_MS = 5000;

const logger = new ConsoleLogger();
const projectRoot = path.resolve(__dirname, '../../..');
const config = loadConfig({ projectRoot });
ensureRuntimeDirectories(config);

const seededEquipmentConfig: EquipmentConfig = {
  cameras: [
    {
      id: config.equipment.mainCameraId,
      name: config.equipment.mainCameraName,
      deviceId: config.camera.deviceName || '/dev/video0',
      isActive: true,
    },
  ],
  buttons: [
    config.button.provider === 'gpio' && typeof config.button.gpioPin === 'number'
      ? {
          id: config.equipment.mainButtonId,
          name: config.equipment.mainButtonName,
          type: 'gpio',
          isActive: true,
          gpioPin: config.button.gpioPin,
          gpioChip: config.button.gpioChip,
          activeLow: config.button.activeLow,
        }
      : {
          id: config.equipment.mainButtonId,
          name: config.equipment.mainButtonName,
          type: 'virtual',
          isActive: true,
        },
  ],
  bindings: [
    {
      buttonId: config.equipment.mainButtonId,
      cameraIds: [config.equipment.mainCameraId],
    },
  ],
};

const equipmentStore = new EquipmentStore(config.paths.runtimeRoot, seededEquipmentConfig);
const hostHealth = new HostHealthMonitor(config.paths.runtimeRoot);
const equipmentConfig = equipmentStore.loadSync();

for (const root of [config.paths.segmentsRoot, config.paths.previewRoot]) {
  for (const entry of fs.readdirSync(root)) {
    if (entry.startsWith('session-')) {
      fs.rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  }
}

const sessionName = `session-${new Date().toISOString().replaceAll(':', '-')}`;
const CameraClass = process.platform === 'win32' ? UsbCameraWindows : UsbCameraLinux;
const linkedCameras = selectLinkedCameras(equipmentConfig);
const recordingTargets =
  linkedCameras.length > 0
    ? linkedCameras.map((item) => ({
        id: item.camera.id,
        deviceId: item.camera.deviceId.trim(),
        name: item.camera.name,
      }))
    : [
        {
          id: config.equipment.mainCameraId,
          deviceId: config.camera.deviceName || '',
          name: config.equipment.mainCameraName,
        },
      ];

const clipStorage = createClipStorage(config, logger);
const clipBuilder = new ClipBuilder({
  tempDirectory: config.paths.tempRoot,
  ffmpegPath: config.app.ffmpegPath ?? resolveFfmpegPath(),
});

interface RunningLane {
  cameraId: string;
  deviceId: string;
  name: string;
  previewImagePath: string;
  camera: UsbCameraWindows;
  application: ClipRecorderApplication;
  started: boolean;
  retryTimer?: NodeJS.Timeout;
}

function laneFileKey(cameraId: string): string {
  const safe = cameraId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe || 'camera';
}

const lanes: RunningLane[] = recordingTargets.map((target, index) => {
  const key = laneFileKey(target.id);
  const previewImagePath = path.join(config.paths.previewRoot, `${sessionName}-${key}.jpg`);
  const camera = new CameraClass({
    outputDirectory: path.join(config.paths.segmentsRoot, `${sessionName}-${key}`),
    previewImagePath,
    segmentDurationSeconds: config.video.segmentDurationSeconds,
    width: config.camera.width,
    height: config.camera.height,
    fps: config.camera.fps,
    format: config.camera.format,
    deviceName: target.deviceId || undefined,
    audioDeviceName: index === 0 ? config.camera.audioDeviceName : undefined,
    enableAudio: index === 0 && config.camera.enableAudio,
    audioGainDb: config.camera.audioGainDb,
    audioDenoise: config.camera.audioDenoise,
    ffmpegPath: config.app.ffmpegPath,
    outputFps: config.video.outputFps,
    previewWidth: config.preview.width,
    previewIntervalSeconds: config.preview.intervalSeconds,
    encoder: config.video.encoder,
    bitrateKbps: config.video.bitrateKbps,
    logger,
  });
  const application = new ClipRecorderApplication({
    config,
    camera,
    triggerButton: new VirtualButton(),
    videoBuffer: new VideoBuffer({ bufferDurationSeconds: config.video.bufferDurationSeconds, logger }),
    clipBuilder,
    clipStorage,
    logger,
  });

  return {
    cameraId: target.id,
    deviceId: target.deviceId,
    name: target.name,
    previewImagePath,
    camera,
    application,
    started: false,
  };
});

const fleet = new RecordingFleet(
  lanes.map((lane) => ({ cameraId: lane.cameraId, application: lane.application })),
  logger,
);
fleet.setRecordingEnabled(
  equipmentConfig.cameras.some((camera) => camera.isActive),
  'Nenhuma câmera ativa. Ative ao menos uma câmera para gravar.',
);

const gpioSources: TriggerButton[] = [];
const seenPins = new Set<string>();
for (const button of equipmentConfig.buttons) {
  if (button.type !== 'gpio' || !button.isActive || typeof button.gpioPin !== 'number') {
    continue;
  }

  const chip = button.gpioChip || config.button.gpioChip || 'gpiochip0';
  const pinKey = `${chip}:${button.gpioPin}`;
  if (seenPins.has(pinKey)) {
    continue;
  }
  seenPins.add(pinKey);

  const pin = button.gpioPin;
  const gpio = new GpioButton({
    pin,
    chip,
    activeLow: button.activeLow ?? config.button.activeLow,
    debounceMs: config.button.debounceMs,
    logger,
  });
  gpio.onPress(() => {
    const cameraIds = cameraIdsForGpioPin(equipmentStore.loadSync(), pin, chip);
    logger.info('GPIO_TRIGGER', { pin, chip, cameraIds });
    void fleet.trigger(cameraIds);
  });
  gpioSources.push(gpio);
}

const gpioButton = new CompositeTriggerButton(gpioSources, (error) => {
  logger.error('TRIGGER_SOURCE_START_FAILED', {
    error: error instanceof Error ? error.message : String(error),
  });
});

const syncService = config.sync.enabled
  ? new SyncService({
      application: fleet,
      monitor: new ConnectivityMonitor({
        url: config.sync.connectivityUrl,
        intervalMs: config.sync.checkIntervalSeconds * 1000,
      }),
      clipsRoot: config.paths.clipsRoot,
      stateFilePath: path.join(config.paths.runtimeRoot, 'sync-state.json'),
      retryIntervalMs: config.sync.retryIntervalSeconds * 1000,
      logger,
    })
  : undefined;

const retention = new StorageRetention({
  directory: config.paths.clipsRoot,
  maxPercent: config.storage.maxDiskPercent,
  maxBytes: config.storage.maxDiskBytes,
  isUploaded: (filePath) =>
    fleet.getSnapshot().clips.some((clip) => clip.filePath === filePath && clip.storageStatus === 'uploaded'),
  logger,
});
let retentionRunning = false;
async function runRetention(): Promise<void> {
  if (retentionRunning) {
    return;
  }
  retentionRunning = true;
  try {
    const result = await retention.enforce();
    if (result.removed.length > 0) {
      fleet.forgetClipFiles(result.removed);
    }
  } catch (error) {
    logger.error('RETENTION_FAILED', { error: error instanceof Error ? error.message : String(error) });
  } finally {
    retentionRunning = false;
  }
}
fleet.onClipsChange(() => void runRetention());
const retentionTimer = setInterval(() => void runRetention(), config.storage.retentionIntervalSeconds * 1000);
retentionTimer.unref();

const server = createHttpServer({
  application: fleet,
  pressTrigger: () => {
    void fleet.trigger(lanes.map((lane) => lane.cameraId));
  },
  previewImagePath: lanes[0]?.previewImagePath ?? path.join(config.paths.previewRoot, `${sessionName}.jpg`),
  clipsRoot: config.paths.clipsRoot,
  webRoot: process.env.WEB_ROOT
    ? path.resolve(process.env.WEB_ROOT)
    : path.join(projectRoot, 'apps', 'desktop', 'dist', 'renderer'),
  auth: config.auth,
  storage: {
    maxLocalBytes: config.storage.maxDiskBytes,
    maxCloudBytes: config.storage.maxCloudBytes,
  },
  preview: config.preview,
  equipmentStore,
  detectCameras: () => listCameraDevices(config.app.ffmpegPath),
  onEquipmentConfigChanged: (nextConfig) => {
    fleet.setRecordingEnabled(
      nextConfig.cameras.some((camera) => camera.isActive),
      'Nenhuma câmera ativa. Ative ao menos uma câmera para gravar.',
    );
  },
  getHostHealth: () => hostHealth.read(),
  getLiveView: async () => {
    const catalog = await equipmentStore.load();
    const described = buildBoundCameraCards(catalog);
    const cards =
      described.length > 0
        ? described
        : lanes.map((lane) => ({
            key: lane.cameraId,
            cameraId: lane.cameraId,
            deviceId: lane.deviceId,
            title: lane.name,
            buttonNames: [] as string[],
            source: 'preview' as const,
          }));

    return {
      cards: await Promise.all(
        cards.map(async (card) => {
          const lane = lanes.find((item) => item.cameraId === card.cameraId);
          const frame = lane ? await readPreviewFrame(lane.previewImagePath) : {};
          const laneStatus = lane?.application.getSnapshot().status;
          const failed = laneStatus?.cameraStatus === 'error';
          return {
            ...card,
            ...frame,
            status: frame.imageDataUrl ? ('online' as const) : failed ? ('error' as const) : ('waiting' as const),
            message: frame.imageDataUrl ? undefined : laneStatus?.lastMessage ?? 'Aguardando preview da câmera...',
          };
        }),
      ),
    };
  },
  logger,
});

let shuttingDown = false;

function scheduleLaneRetry(lane: RunningLane, reason: string): void {
  if (shuttingDown || lane.retryTimer) {
    return;
  }

  logger.warn('CAMERA_RETRY_SCHEDULED', { cameraId: lane.cameraId, reason, delayMs: CAMERA_RETRY_DELAY_MS });
  lane.retryTimer = setTimeout(() => {
    lane.retryTimer = undefined;
    void startLane(lane);
  }, CAMERA_RETRY_DELAY_MS);
}

async function startLane(lane: RunningLane): Promise<void> {
  const firstStart = !lane.started;
  lane.started = true;
  try {
    if (firstStart) {
      await lane.application.start();
      return;
    }

    await lane.camera.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('CAMERA_STARTUP_FAILED', { cameraId: lane.cameraId, error: message });
    scheduleLaneRetry(lane, message);
  }
}

for (const lane of lanes) {
  lane.camera.onStatusChange((status) => {
    if (!lane.started || shuttingDown) {
      return;
    }
    if (status === 'error' || status === 'offline') {
      scheduleLaneRetry(lane, `camera ${status}`);
    }
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('SHUTDOWN', { signal });
  for (const lane of lanes) {
    if (lane.retryTimer) {
      clearTimeout(lane.retryTimer);
    }
  }

  syncService?.stop();
  server.close();
  server.closeAllConnections();
  await gpioButton.stop().catch(() => undefined);
  for (const lane of lanes) {
    await lane.application.stop().catch(() => undefined);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const port = config.app.port ?? 3000;
server.listen(port, config.app.host, () => {
  logger.info('SERVER_LISTENING', { host: config.app.host, port, cameras: lanes.map((lane) => lane.deviceId) });
  void gpioButton.start();
  for (const lane of lanes) {
    void startLane(lane);
  }
  void syncService?.start().catch((error: unknown) =>
    logger.error('SYNC_START_FAILED', { error: error instanceof Error ? error.message : String(error) }),
  );
});
