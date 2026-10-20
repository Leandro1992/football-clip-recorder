import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '@football-clip-recorder/core';
import { buildV4l2InputArguments } from './usb-camera-linux';
import { buildDirectShowInputArguments } from './usb-camera-windows';
import { resolveFfmpegPath } from './ffmpeg-path';

export interface PreviewCaptureOptions {
  cameraId: string;
  deviceId: string;
  previewImagePath: string;
  width: number;
  height: number;
  fps: number;
  format?: string;
  ffmpegPath?: string;
  logger: Logger;
  platform?: NodeJS.Platform;
}

export type PreviewCaptureStatus = 'offline' | 'starting' | 'online' | 'error';

export function buildPreviewCaptureArguments(options: {
  platform: NodeJS.Platform;
  deviceId: string;
  width: number;
  height: number;
  fps: number;
  format?: string;
  previewImagePath: string;
}): string[] {
  const input =
    options.platform === 'win32'
      ? buildDirectShowInputArguments({
          fps: options.fps,
          width: options.width,
          height: options.height,
          format: options.format,
          deviceName: options.deviceId,
        })
      : buildV4l2InputArguments({
          fps: options.fps,
          width: options.width,
          height: options.height,
          format: options.format,
          devicePath: options.deviceId,
        });

  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    ...input,
    '-an',
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

/** JPEG-only capture for a camera that is not already recording segments. */
export class PreviewCapture {
  readonly deviceId: string;
  readonly previewImagePath: string;
  private status: PreviewCaptureStatus = 'offline';
  private message?: string;
  private process?: ChildProcess;
  private running = false;
  private stopping = false;

  constructor(private readonly options: PreviewCaptureOptions) {
    this.deviceId = options.deviceId;
    this.previewImagePath = options.previewImagePath;
  }

  getState(): { status: PreviewCaptureStatus; message?: string } {
    return { status: this.status, message: this.message };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.stopping = false;
    this.status = 'starting';
    this.message = 'Abrindo câmera...';
    await fs.mkdir(path.dirname(this.previewImagePath), { recursive: true });
    await fs.rm(this.previewImagePath, { force: true });

    const ffmpegPath = resolveFfmpegPath(this.options.ffmpegPath);
    const args = buildPreviewCaptureArguments({
      platform: this.options.platform ?? process.platform,
      deviceId: this.options.deviceId,
      width: this.options.width,
      height: this.options.height,
      fps: this.options.fps,
      format: this.options.format,
      previewImagePath: this.options.previewImagePath,
    });

    try {
      const captureProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.process = captureProcess;
      this.running = true;
      this.status = 'online';
      this.message = undefined;

      captureProcess.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          this.options.logger.warn('PREVIEW_FFMPEG', { cameraId: this.options.cameraId, message: text });
        }
      });

      captureProcess.on('error', (error: Error) => {
        this.running = false;
        this.status = 'error';
        this.message = error.message;
        this.options.logger.error('PREVIEW_FAILED', {
          cameraId: this.options.cameraId,
          deviceId: this.options.deviceId,
          error: error.message,
        });
      });

      captureProcess.on('exit', (code: number | null) => {
        this.running = false;
        this.process = undefined;
        if (this.stopping) {
          this.status = 'offline';
          return;
        }

        this.status = 'error';
        this.message = `Falha ao abrir ${this.options.deviceId}.`;
        this.options.logger.error('PREVIEW_FAILED', {
          cameraId: this.options.cameraId,
          deviceId: this.options.deviceId,
          code,
        });
      });

      this.options.logger.info('PREVIEW_STARTED', {
        cameraId: this.options.cameraId,
        deviceId: this.options.deviceId,
      });
    } catch (error) {
      this.running = false;
      this.status = 'error';
      this.message = error instanceof Error ? error.message : 'Falha ao abrir a câmera.';
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = undefined;
    this.running = false;
    this.status = 'offline';
    await fs.rm(this.previewImagePath, { force: true });
    this.options.logger.info('PREVIEW_STOPPED', {
      cameraId: this.options.cameraId,
      deviceId: this.options.deviceId,
    });
  }
}
