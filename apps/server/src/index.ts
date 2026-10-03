import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ensureRuntimeDirectories } from '@football-clip-recorder/config';
import { ClipRecorderApplication, ConsoleLogger, type TriggerButton } from '@football-clip-recorder/core';
import { resolveFfmpegPath, UsbCameraLinux, UsbCameraWindows } from '@football-clip-recorder/camera';
import { CompositeTriggerButton, GpioButton, VirtualButton } from '@football-clip-recorder/hardware';
import { createClipStorage } from '@football-clip-recorder/storage';
import { ClipBuilder, VideoBuffer } from '@football-clip-recorder/video';
import { createHttpServer } from './http-server';

const CAMERA_RETRY_DELAY_MS = 5000;

const logger = new ConsoleLogger();
const projectRoot = path.resolve(__dirname, '../../..');
const config = loadConfig({ projectRoot });
ensureRuntimeDirectories(config);

// Segments and previews are only a rolling buffer; leftovers from earlier runs would fill the SD card.
for (const root of [config.paths.segmentsRoot, config.paths.previewRoot]) {
  for (const entry of fs.readdirSync(root)) {
    if (entry.startsWith('session-')) {
      fs.rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  }
}

const sessionName = `session-${new Date().toISOString().replaceAll(':', '-')}`;
const previewImagePath = path.join(config.paths.previewRoot, `${sessionName}.jpg`);

const CameraClass = process.platform === 'win32' ? UsbCameraWindows : UsbCameraLinux;
const camera = new CameraClass({
  outputDirectory: path.join(config.paths.segmentsRoot, sessionName),
  previewImagePath,
  segmentDurationSeconds: config.video.segmentDurationSeconds,
  width: config.camera.width,
  height: config.camera.height,
  fps: config.camera.fps,
  format: config.camera.format,
  deviceName: config.camera.deviceName,
  audioDeviceName: config.camera.audioDeviceName,
  enableAudio: config.camera.enableAudio,
  audioGainDb: config.camera.audioGainDb,
  audioDenoise: config.camera.audioDenoise,
  ffmpegPath: config.app.ffmpegPath,
  logger,
});

const virtualButton = new VirtualButton();
const triggerSources: TriggerButton[] = [virtualButton];
if (config.button.provider === 'gpio') {
  triggerSources.push(
    new GpioButton({
      pin: config.button.gpioPin as number,
      chip: config.button.gpioChip,
      activeLow: config.button.activeLow,
      debounceMs: config.button.debounceMs,
      logger,
    }),
  );
}
const triggerButton = new CompositeTriggerButton(triggerSources, (error) => {
  logger.error('TRIGGER_SOURCE_START_FAILED', {
    error: error instanceof Error ? error.message : String(error),
  });
});

const application = new ClipRecorderApplication({
  config,
  camera,
  triggerButton,
  videoBuffer: new VideoBuffer({ bufferDurationSeconds: config.video.bufferDurationSeconds, logger }),
  clipBuilder: new ClipBuilder({
    tempDirectory: config.paths.tempRoot,
    ffmpegPath: config.app.ffmpegPath ?? resolveFfmpegPath(),
  }),
  clipStorage: createClipStorage(config, logger),
  logger,
});

const server = createHttpServer({
  application,
  pressTrigger: () => virtualButton.press(),
  previewImagePath,
  clipsRoot: config.paths.clipsRoot,
  webRoot: process.env.WEB_ROOT
    ? path.resolve(process.env.WEB_ROOT)
    : path.join(projectRoot, 'apps', 'desktop', 'dist', 'renderer'),
  logger,
});

let shuttingDown = false;
let applicationStarted = false;
let retryTimer: NodeJS.Timeout | undefined;

function scheduleCameraRetry(reason: string): void {
  if (shuttingDown || retryTimer) {
    return;
  }

  logger.warn('CAMERA_RETRY_SCHEDULED', { reason, delayMs: CAMERA_RETRY_DELAY_MS });
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void startCapture();
  }, CAMERA_RETRY_DELAY_MS);
}

async function startCapture(): Promise<void> {
  try {
    if (applicationStarted) {
      await camera.start();
    } else {
      await application.start();
      applicationStarted = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('CAMERA_STARTUP_FAILED', { error: message });
    scheduleCameraRetry(message);
  }
}

// ffmpeg exits when the camera is unplugged; keep trying so the device recovers without a reboot.
camera.onStatusChange((status) => {
  if (applicationStarted && (status === 'error' || status === 'offline')) {
    scheduleCameraRetry(`camera ${status}`);
  }
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('SHUTDOWN', { signal });
  if (retryTimer) {
    clearTimeout(retryTimer);
  }

  server.close();
  server.closeAllConnections();
  await application.stop().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const port = config.app.port ?? 3000;
server.listen(port, config.app.host, () => {
  logger.info('SERVER_LISTENING', { host: config.app.host, port });
  void startCapture();
});
