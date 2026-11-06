import {
  activeCourtCatalog,
  buildClipFileName,
  courtIdFromClipName,
  courtUploadTargets,
  normalizeEquipmentConfig,
  slugPart,
} from './courts';

describe('slugPart', () => {
  it('folds spaces and accents', () => {
    expect(slugPart('Quadra São João', 'quadra')).toBe('quadra-sao-joao');
  });

  it('uses the fallback when the name is empty', () => {
    expect(slugPart('   ', 'camera')).toBe('camera');
  });
});

describe('buildClipFileName', () => {
  it('prefixes the court, the camera and the local time', () => {
    const name = buildClipFileName({
      courtName: 'Quadra Centro',
      cameraName: 'Gol',
      courtId: 'quadra-principal',
      triggeredAt: new Date(2026, 10, 3, 15, 4, 5),
    });
    expect(name).toBe('quadra-centro__gol__20261103-150405__quadra-principal');
  });
});

describe('courtIdFromClipName', () => {
  it('reads the court from a generated file', () => {
    expect(courtIdFromClipName('quadra-centro__gol__20261103-150405__quadra-principal.mp4')).toBe('quadra-principal');
  });

  it('ignores a clip saved before courts existed', () => {
    expect(courtIdFromClipName('clip-123-camera.mp4')).toBeUndefined();
  });
});

describe('normalizeEquipmentConfig', () => {
  it('keeps cameras and buttons when the file has no courts yet', () => {
    const config = normalizeEquipmentConfig({
      cameras: [{ id: 'cam-1', name: 'Gol', deviceId: '/dev/video0', isActive: true }],
      buttons: [{ id: 'btn-1', name: 'Botao', type: 'virtual', isActive: true }],
      bindings: [{ buttonId: 'btn-1', cameraIds: ['cam-1'] }],
    });
    expect(config.courts).toHaveLength(1);
    expect(config.cameras[0]?.name).toBe('Gol');
    expect(config.buttons[0]?.id).toBe('btn-1');
    expect(config.courts[0]?.cameraIds).toEqual(['cam-1']);
    expect(config.courts[0]?.buttonIds).toEqual(['btn-1']);
    expect(config.activeCourtId).toBe(config.courts[0]?.id);
  });

  it('lifts cameras, buttons and the secret out of a nested court', () => {
    const config = normalizeEquipmentConfig({
      activeCourtId: 'q2',
      courts: [
        {
          id: 'q1',
          name: 'A',
          cloud: { endpoint: 'https://r2.example', bucket: 'lances', region: 'auto', accessKeyId: 'key', secretAccessKey: 'stored' },
          cameras: [
            { id: 'cam-1', name: 'Gol', deviceId: '/dev/video0', isActive: true },
            { id: 'cam-2', name: 'Lateral', deviceId: '/dev/video1', isActive: true },
          ],
          buttons: [{ id: 'btn-1', name: 'Botao', type: 'gpio', isActive: true, gpioPin: 17 }],
          bindings: [{ buttonId: 'btn-1', cameraIds: ['cam-1'] }],
        },
        { id: 'q2', name: 'B', cameras: [], buttons: [], bindings: [] },
      ],
    });
    expect(config.activeCourtId).toBe('q2');
    expect(config.cameras.map((camera) => camera.id)).toEqual(['cam-1', 'cam-2']);
    expect(config.buttons[0]?.gpioPin).toBe(17);
    expect(config.buckets[0]?.secretAccessKey).toBe('stored');
    expect(config.courts[0]?.cameraIds).toEqual(['cam-1', 'cam-2']);
    expect(config.courts[0]?.bucketId).toBe('bucket-q1');
    expect(config.courts[1]?.name).toBe('B');
  });

  it('keeps a court that already points at the catalogs', () => {
    const config = normalizeEquipmentConfig({
      activeCourtId: 'q1',
      cameras: [
        { id: 'cam-1', name: 'Gol', deviceId: '/dev/video0', isActive: true },
        { id: 'cam-2', name: 'Lateral', deviceId: '/dev/video1', isActive: false },
      ],
      buttons: [{ id: 'btn-1', name: 'Botao', type: 'virtual', isActive: true }],
      buckets: [
        { id: 'bucket-1', name: 'R2', endpoint: 'https://r2.example', bucket: 'lances', region: 'auto', accessKeyId: 'key', secretAccessKey: 'stored' },
      ],
      courts: [{ id: 'q1', name: 'Centro', cameraIds: ['cam-1', 'cam-2', 'missing'], buttonIds: ['btn-1'], bucketId: 'bucket-1' }],
    });
    expect(config.courts[0]?.cameraIds).toEqual(['cam-1', 'cam-2']);
    expect(activeCourtCatalog(config).bindings[0]?.cameraIds).toEqual(['cam-1', 'cam-2']);
    expect(courtUploadTargets(config)[0]?.cloud.secretAccessKey).toBe('stored');
  });
});
