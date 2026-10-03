import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { BufferedVideoSegment, CameraStatus, Logger, SegmentingCamera } from '@football-clip-recorder/core';
import { listAudioDevices, listCameraDevices } from './device-list';
import { resolveFfmpegPath } from './ffmpeg-path';

export interface UsbCameraWindowsOptions {
  outputDirectory: string;
  previewImagePath: string;
  segmentDurationSeconds: number;
  width: number;
  height: number;
  fps: number;
  format?: string;
  deviceName?: string;
  audioDeviceName?: string;
  enableAudio?: boolean;
  audioGainDb?: number;
  audioDenoise?: boolean;
  ffmpegPath?: string;
  pollIntervalMs?: number;
  logger: Logger;
}

export function buildDirectShowInputArguments(options: {
  fps: number;
  width: number;
  height: number;
  format?: string;
  deviceName: string;
  audioDeviceName?: string;
}): string[] {
  const format = options.format?.trim().toLowerCase();
  const formatArguments =
    format === 'mjpeg' || format === 'mjpg'
      ? ['-vcodec', 'mjpeg']
      : format
        ? ['-pixel_format', format]
        : [];

  const inputSource = options.audioDeviceName
    ? `video=${escapeDshowDeviceName(options.deviceName)}:audio=${escapeDshowDeviceName(options.audioDeviceName)}`
    : `video=${escapeDshowDeviceName(options.deviceName)}`;

  return [
    '-f',
    'dshow',
    '-rtbufsize',
    '256M',
    '-framerate',
    String(options.fps),
    '-video_size',
    `${options.width}x${options.height}`,
    ...formatArguments,
    '-i',
    inputSource,
  ];
}

function escapeDshowDeviceName(deviceName: string): string {
  return deviceName.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function buildAudioFilter(gainDb?: number, denoise?: boolean): string {
  const filters: string[] = [];
  if (denoise) {
    filters.push('highpass=f=100', 'afftdn=nr=12:nf=-40');
  }
  if (gainDb) {
    filters.push(`volume=${gainDb}dB`, 'alimiter=limit=0.95');
  }
  filters.push('aresample=async=1:first_pts=0');
  return filters.join(',');
}

export function buildCameraOutputArguments(options: {
  segmentDurationSeconds: number;
  segmentPattern: string;
  previewImagePath: string;
  includeAudio: boolean;
  audioInputIndex?: number;
  audioGainDb?: number;
  audioDenoise?: boolean;
  keyframeIntervalSeconds?: number;
  segmentStartNumber?: number;
}): string[] {
  const audioArguments = options.includeAudio
    ? [
        '-map',
        `${options.audioInputIndex ?? 0}:a:0`,
        '-af',
        buildAudioFilter(options.audioGainDb, options.audioDenoise),
        '-ar',
        '48000',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
      ]
    : ['-an'];

  const keyframeArguments = options.keyframeIntervalSeconds
    ? ['-force_key_frames', `expr:gte(t,n_forced*${options.keyframeIntervalSeconds})`]
    : [];
  const startNumberArguments =
    options.segmentStartNumber === undefined ? [] : ['-segment_start_number', String(options.segmentStartNumber)];

  return [
    '-map',
    '0:v',
    ...audioArguments,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    ...keyframeArguments,
    '-f',
    'segment',
    '-segment_time',
    String(options.segmentDurationSeconds),
    '-reset_timestamps',
    '1',
    ...startNumberArguments,
    options.segmentPattern,
    '-map',
    '0:v',
    '-vf',
    'fps=1,scale=960:-1',
    '-q:v',
    '5',
    '-update',
    '1',
    '-f',
    'image2',
    options.previewImagePath,
  ];
}

export class UsbCameraWindows implements SegmentingCamera {
  protected readonly segmentCallbacks = new Set<(segment: BufferedVideoSegment) => void>();
  protected readonly statusCallbacks = new Set<(status: CameraStatus) => void>();
  protected readonly errorCallbacks = new Set<(error: Error) => void>();
  protected readonly knownFiles = new Map<string, number>();
  protected readonly emittedFiles = new Set<string>();
  protected captureProcess?: ReturnType<typeof spawn>;
  protected pollTimer?: NodeJS.Timeout;
  protected cameraName?: string;
  protected audioName?: string;
  protected running = false;
  protected sequence = 0;

  constructor(protected readonly options: UsbCameraWindowsOptions) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.emitStatus('starting');
    await fs.mkdir(this.options.outputDirectory, { recursive: true });
    await fs.mkdir(path.dirname(this.options.previewImagePath), { recursive: true });
    await fs.rm(this.options.previewImagePath, { force: true });

    const ffmpegPath = resolveFfmpegPath(this.options.ffmpegPath);
    this.cameraName = this.options.deviceName ?? (await this.detectDefaultCamera());
    this.audioName = this.options.enableAudio
      ? this.options.audioDeviceName ?? (await this.detectDefaultAudio())
      : undefined;
    const segmentPattern = path.join(this.options.outputDirectory, 'segment_%06d.mp4');
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      ...this.buildInputArguments(),
      ...this.buildOutputArguments(segmentPattern),
    ];

    const captureProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.captureProcess = captureProcess;

    captureProcess.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (!message) {
        return;
      }

      this.options.logger.warn('CAMERA_FFMPEG', { message });
    });

    captureProcess.on('error', (error: Error) => {
      this.running = false;
      this.emitStatus('error');
      this.emitError(error);
    });

    captureProcess.on('exit', (code: number | null) => {
      this.running = false;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }

      if (code !== 0 && code !== null) {
        this.emitStatus('error');
        this.emitError(new Error(`Camera capture process exited with code ${code}`));
        return;
      }

      this.emitStatus('offline');
    });

    this.running = true;
    this.emitStatus('online');
    this.options.logger.info('CAMERA_STARTED', {
      cameraId: this.getCameraId(),
      outputDirectory: this.options.outputDirectory,
      audioEnabled: Boolean(this.audioName),
      audioDevice: this.audioName,
    });

    this.pollTimer = setInterval(() => {
      void this.pollSegments();
    }, this.options.pollIntervalMs ?? 500);
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.captureProcess && !this.captureProcess.killed) {
      this.captureProcess.kill();
    }

    this.running = false;
    this.options.logger.info('CAMERA_STOPPED', { cameraId: this.getCameraId() });
    this.emitStatus('offline');
  }

  isRunning(): boolean {
    return this.running;
  }

  getCameraId(): string {
    return this.cameraName ?? this.options.deviceName ?? 'unresolved-camera';
  }

  onSegmentCreated(callback: (segment: BufferedVideoSegment) => void): void {
    this.segmentCallbacks.add(callback);
  }

  onStatusChange(callback: (status: CameraStatus) => void): void {
    this.statusCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  protected buildInputArguments(): string[] {
    return buildDirectShowInputArguments({
      fps: this.options.fps,
      width: this.options.width,
      height: this.options.height,
      format: this.options.format,
      deviceName: this.cameraName as string,
      audioDeviceName: this.audioName,
    });
  }

  protected buildOutputArguments(segmentPattern: string): string[] {
    return buildCameraOutputArguments({
      segmentDurationSeconds: this.options.segmentDurationSeconds,
      segmentPattern,
      previewImagePath: this.options.previewImagePath,
      includeAudio: Boolean(this.audioName),
      audioGainDb: this.options.audioGainDb,
      audioDenoise: this.options.audioDenoise,
      segmentStartNumber: this.sequence,
    });
  }

  protected async detectDefaultCamera(): Promise<string> {
    const devices = await listCameraDevices(this.options.ffmpegPath);
    if (devices.length === 0) {
      throw new Error('No DirectShow camera devices were found.');
    }

    return devices[0].name;
  }

  protected async detectDefaultAudio(): Promise<string> {
    const devices = await listAudioDevices(this.options.ffmpegPath);
    if (devices.length === 0) {
      throw new Error('ENABLE_AUDIO=true, but no DirectShow audio device was found.');
    }

    return devices[0].name;
  }

  protected async pollSegments(): Promise<void> {
    const files = (await fs.readdir(this.options.outputDirectory))
      .filter((fileName) => fileName.endsWith('.mp4'))
      .sort()
      .map((fileName) => path.join(this.options.outputDirectory, fileName));

    for (const filePath of files) {
      if (this.emittedFiles.has(filePath)) {
        continue;
      }

      const fileStat = await fs.stat(filePath);
      const previousSize = this.knownFiles.get(filePath);
      const isNewestFile = filePath === files[files.length - 1];

      if (previousSize === undefined || previousSize !== fileStat.size || (isNewestFile && this.running)) {
        this.knownFiles.set(filePath, fileStat.size);
        continue;
      }

      this.knownFiles.delete(filePath);
      this.emittedFiles.add(filePath);
      this.sequence += 1;

      const endedAt = new Date(fileStat.mtimeMs);
      const startedAt = new Date(
        endedAt.getTime() - this.options.segmentDurationSeconds * 1000,
      );

      const segment: BufferedVideoSegment = {
        id: `segment-${this.sequence}`,
        sequence: this.sequence,
        filePath,
        startedAt,
        endedAt,
        durationSeconds: this.options.segmentDurationSeconds,
      };

      for (const callback of this.segmentCallbacks) {
        callback(segment);
      }
    }
  }

  private emitStatus(status: CameraStatus): void {
    for (const callback of this.statusCallbacks) {
      callback(status);
    }
  }

  private emitError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      callback(error);
    }
  }
}
