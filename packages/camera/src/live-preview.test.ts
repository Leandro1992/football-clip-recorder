import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPreviewCaptureArguments } from './preview-capture';
import { buildLiveCameraCards, readPreviewFrame, selectLinkedCameras, type EquipmentCatalog } from './live-preview';

const catalog: EquipmentCatalog = {
  cameras: [
    { id: 'main', name: 'Gol norte', deviceId: '/dev/video0', isActive: true },
    { id: 'extra', name: 'Gol sul', deviceId: '/dev/video2', isActive: true },
    { id: 'idle', name: 'Reserva', deviceId: '/dev/video4', isActive: false },
    { id: 'loose', name: 'Sem botão', deviceId: '/dev/video6', isActive: true },
  ],
  buttons: [
    { id: 'virtual', name: 'Botão da mesa', type: 'virtual', isActive: true },
    { id: 'gpio', name: 'Botão do gol', type: 'gpio', isActive: true },
    { id: 'off', name: 'Botão desligado', type: 'virtual', isActive: false },
  ],
  bindings: [
    { buttonId: 'virtual', cameraIds: ['main'] },
    { buttonId: 'gpio', cameraIds: ['extra'] },
    { buttonId: 'off', cameraIds: ['loose'] },
  ],
};

describe('selectLinkedCameras', () => {
  it('keeps active cameras linked to an active virtual or gpio button', () => {
    expect(selectLinkedCameras(catalog).map((item) => item.camera.id)).toEqual(['main', 'extra']);
  });
});

describe('buildLiveCameraCards', () => {
  it('shows the recording camera and an extra linked device', () => {
    expect(
      buildLiveCameraCards(catalog, { recordingDeviceId: '/dev/video0', platform: 'linux' }).map((card) => ({
        key: card.key,
        title: card.title,
        source: card.source,
        buttonNames: card.buttonNames,
      })),
    ).toEqual([
      { key: 'recording', title: 'Gol norte', source: 'recording', buttonNames: ['Botão da mesa'] },
      { key: 'extra', title: 'Gol sul', source: 'preview', buttonNames: ['Botão do gol'] },
    ]);
  });

  it('does not open a second card for the windows placeholder device', () => {
    const windowsCatalog: EquipmentCatalog = {
      cameras: [{ id: 'seed', name: 'Camera principal', deviceId: '/dev/video0', isActive: true }],
      buttons: [{ id: 'virtual', name: 'Botao principal', type: 'virtual', isActive: true }],
      bindings: [{ buttonId: 'virtual', cameraIds: ['seed'] }],
    };

    expect(buildLiveCameraCards(windowsCatalog, { recordingDeviceId: 'USB Camera', platform: 'win32' })).toEqual([
      {
        key: 'recording',
        deviceId: 'USB Camera',
        title: 'Camera principal',
        buttonNames: ['Botao principal'],
        source: 'recording',
      },
    ]);
  });
});

describe('buildPreviewCaptureArguments', () => {
  it('writes a jpeg preview and does not segment the extra camera', () => {
    const args = buildPreviewCaptureArguments({
      platform: 'linux',
      deviceId: '/dev/video2',
      width: 1280,
      height: 720,
      fps: 30,
      format: 'mjpeg',
      previewImagePath: '/tmp/live-extra.jpg',
    });

    expect(args).toContain('v4l2');
    expect(args).toContain('/dev/video2');
    expect(args).toContain('image2');
    expect(args).toContain('/tmp/live-extra.jpg');
    expect(args).toContain('fps=1/2,scale=480:-1:flags=fast_bilinear');
    expect(args).not.toContain('segment');
  });
});

describe('readPreviewFrame', () => {
  it('keeps the last complete jpeg when a newer file is still being written', async () => {
    const filePath = path.join(os.tmpdir(), `preview-${Date.now()}.jpg`);
    const complete = Buffer.from([0xff, 0xd8, 0x00, 0x11, 0xff, 0xd9]);
    await fs.writeFile(filePath, complete);

    const first = await readPreviewFrame(filePath);
    expect(first.imageDataUrl).toContain('data:image/jpeg;base64,');

    await fs.writeFile(filePath, Buffer.from([0xff, 0xd8, 0x00]));
    const second = await readPreviewFrame(filePath);
    expect(second.imageDataUrl).toBe(first.imageDataUrl);

    await fs.rm(filePath, { force: true });
    expect(await readPreviewFrame(filePath)).toEqual({});
  });
});
