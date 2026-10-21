import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '@football-clip-recorder/core';
import { PreviewCapture, type PreviewCaptureStatus } from './preview-capture';

export interface CatalogCamera {
  id: string;
  name: string;
  deviceId: string;
  isActive: boolean;
}

export interface CatalogButton {
  id: string;
  name: string;
  type: 'virtual' | 'gpio';
  isActive: boolean;
}

export interface CatalogBinding {
  buttonId: string;
  cameraIds: string[];
}

export interface EquipmentCatalog {
  cameras: CatalogCamera[];
  buttons: CatalogButton[];
  bindings: CatalogBinding[];
}

export interface LinkedCamera {
  camera: CatalogCamera;
  buttonNames: string[];
}

export interface LiveCameraCard {
  key: string;
  cameraId?: string;
  deviceId?: string;
  title: string;
  buttonNames: string[];
  source: 'recording' | 'preview';
}

export interface LivePreviewCard extends LiveCameraCard {
  imageDataUrl?: string;
  updatedAt?: number;
  status: PreviewCaptureStatus | 'waiting';
  message?: string;
}

export function selectLinkedCameras(catalog: EquipmentCatalog): LinkedCamera[] {
  const buttonsById = new Map(catalog.buttons.map((button) => [button.id, button]));
  const linked: LinkedCamera[] = [];

  for (const camera of catalog.cameras) {
    if (!camera.isActive || !camera.deviceId.trim()) {
      continue;
    }

    const buttonNames: string[] = [];
    for (const binding of catalog.bindings) {
      if (!binding.cameraIds.includes(camera.id)) {
        continue;
      }

      const button = buttonsById.get(binding.buttonId);
      if (!button?.isActive || (button.type !== 'virtual' && button.type !== 'gpio')) {
        continue;
      }

      if (!buttonNames.includes(button.name)) {
        buttonNames.push(button.name);
      }
    }

    if (buttonNames.length === 0) {
      continue;
    }

    linked.push({ camera, buttonNames });
  }

  return linked;
}

function isRecordingPlaceholder(deviceId: string, platform: NodeJS.Platform): boolean {
  if (!deviceId || deviceId === 'default') {
    return true;
  }

  return platform === 'win32' && deviceId === '/dev/video0';
}

function sameDevice(left?: string, right?: string): boolean {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function appendNames(target: string[], names: string[]): void {
  for (const name of names) {
    if (!target.includes(name)) {
      target.push(name);
    }
  }
}

/** Recording card first, then one card per extra device linked to an active button. */
export function buildLiveCameraCards(
  catalog: EquipmentCatalog,
  options: { recordingDeviceId?: string; platform: NodeJS.Platform },
): LiveCameraCard[] {
  const recordingButtons: string[] = [];
  let recordingTitle = 'Câmera principal';
  const extras: LiveCameraCard[] = [];

  for (const item of selectLinkedCameras(catalog)) {
    const deviceId = item.camera.deviceId.trim();
    const representsRecording =
      sameDevice(deviceId, options.recordingDeviceId) || isRecordingPlaceholder(deviceId, options.platform);

    if (representsRecording) {
      if (recordingTitle === 'Câmera principal') {
        recordingTitle = item.camera.name;
      }
      appendNames(recordingButtons, item.buttonNames);
      continue;
    }

    const existing = extras.find((card) => sameDevice(card.deviceId, deviceId));
    if (existing) {
      appendNames(existing.buttonNames, item.buttonNames);
      continue;
    }

    extras.push({
      key: item.camera.id,
      cameraId: item.camera.id,
      deviceId,
      title: item.camera.name,
      buttonNames: [...item.buttonNames],
      source: 'preview',
    });
  }

  return [
    {
      key: 'recording',
      deviceId: options.recordingDeviceId,
      title: recordingTitle,
      buttonNames: recordingButtons,
      source: 'recording',
    },
    ...extras,
  ];
}

/** One live card per active camera that has an active button. */
export function buildBoundCameraCards(catalog: EquipmentCatalog): LiveCameraCard[] {
  return selectLinkedCameras(catalog).map((item) => ({
    key: item.camera.id,
    cameraId: item.camera.id,
    deviceId: item.camera.deviceId.trim(),
    title: item.camera.name,
    buttonNames: [...item.buttonNames],
    source: 'preview' as const,
  }));
}

export function previewFileName(cameraId: string): string {
  const safe = cameraId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `live-${safe}.jpg`;
}

export async function readPreviewFrame(filePath: string): Promise<{ imageDataUrl?: string; updatedAt?: number }> {
  return readJpegDataUrl(filePath);
}

const lastCompletePreview = new Map<string, { imageDataUrl: string; updatedAt: number }>();

export function isCompleteJpeg(file: Buffer): boolean {
  return (
    file.length >= 4 &&
    file[0] === 0xff &&
    file[1] === 0xd8 &&
    file[file.length - 2] === 0xff &&
    file[file.length - 1] === 0xd9
  );
}

async function readJpegDataUrl(
  filePath: string,
): Promise<{ imageDataUrl?: string; updatedAt?: number }> {
  try {
    const file = await fs.readFile(filePath);
    if (!isCompleteJpeg(file)) {
      return lastCompletePreview.get(filePath) ?? {};
    }

    const stats = await fs.stat(filePath);
    const frame = {
      imageDataUrl: `data:image/jpeg;base64,${file.toString('base64')}`,
      updatedAt: stats.mtimeMs,
    };
    lastCompletePreview.set(filePath, frame);
    return frame;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      lastCompletePreview.delete(filePath);
      return {};
    }
    throw error;
  }
}

export interface LivePreviewHubOptions {
  previewDirectory: string;
  recordingPreviewPath: string;
  resolveRecordingDeviceId: () => string | undefined;
  width: number;
  height: number;
  fps: number;
  format?: string;
  ffmpegPath?: string;
  previewWidth?: number;
  previewIntervalSeconds?: number;
  logger: Logger;
  platform?: NodeJS.Platform;
}

export class LivePreviewHub {
  private readonly capturers = new Map<string, PreviewCapture>();

  constructor(private readonly options: LivePreviewHubOptions) {}

  async sync(catalog: EquipmentCatalog): Promise<void> {
    const cards = buildLiveCameraCards(catalog, {
      recordingDeviceId: this.options.resolveRecordingDeviceId(),
      platform: this.options.platform ?? process.platform,
    }).filter((card) => card.source === 'preview' && card.cameraId && card.deviceId);

    const wanted = new Map(cards.map((card) => [card.cameraId as string, card]));

    for (const [cameraId, capturer] of [...this.capturers]) {
      const next = wanted.get(cameraId);
      if (!next || next.deviceId !== capturer.deviceId) {
        this.capturers.delete(cameraId);
        await capturer.stop();
      }
    }

    for (const [cameraId, card] of wanted) {
      if (this.capturers.has(cameraId)) {
        continue;
      }

      const capturer = new PreviewCapture({
        cameraId,
        deviceId: card.deviceId as string,
        previewImagePath: path.join(this.options.previewDirectory, previewFileName(cameraId)),
        width: this.options.width,
        height: this.options.height,
        fps: this.options.fps,
        format: this.options.format,
        ffmpegPath: this.options.ffmpegPath,
        previewWidth: this.options.previewWidth,
        previewIntervalSeconds: this.options.previewIntervalSeconds,
        logger: this.options.logger,
      });
      this.capturers.set(cameraId, capturer);
      void capturer.start().catch((error: unknown) => {
        this.options.logger.error('PREVIEW_START_FAILED', {
          cameraId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  async snapshot(catalog: EquipmentCatalog): Promise<LivePreviewCard[]> {
    const cards = buildLiveCameraCards(catalog, {
      recordingDeviceId: this.options.resolveRecordingDeviceId(),
      platform: this.options.platform ?? process.platform,
    });
    const previews: LivePreviewCard[] = [];

    for (const card of cards) {
      if (card.source === 'recording') {
        const frame = await readJpegDataUrl(this.options.recordingPreviewPath);
        previews.push({
          ...card,
          ...frame,
          status: frame.imageDataUrl ? 'online' : 'waiting',
          message: frame.imageDataUrl ? undefined : 'Aguardando preview da câmera...',
        });
        continue;
      }

      const capturer = card.cameraId ? this.capturers.get(card.cameraId) : undefined;
      const frame = capturer ? await readJpegDataUrl(capturer.previewImagePath) : {};
      const state = capturer?.getState();
      const status = frame.imageDataUrl
        ? 'online'
        : state?.status === 'error'
          ? 'error'
          : state?.status === 'starting' || state?.status === 'online'
            ? 'starting'
            : 'waiting';

      previews.push({
        ...card,
        ...frame,
        status,
        message: frame.imageDataUrl ? undefined : state?.message ?? 'Aguardando preview da câmera...',
      });
    }

    return previews;
  }

  async stop(): Promise<void> {
    const running = [...this.capturers.values()];
    this.capturers.clear();
    await Promise.all(running.map((capturer) => capturer.stop()));
  }
}
