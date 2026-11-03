import {
  buildClipFileName,
  courtIdFromClipName,
  keepStoredCloudSecrets,
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
    expect(config.courts[0]?.cameras[0]?.name).toBe('Gol');
    expect(config.courts[0]?.buttons[0]?.id).toBe('btn-1');
    expect(config.courts[0]?.bindings[0]?.cameraIds).toEqual(['cam-1']);
    expect(config.activeCourtId).toBe(config.courts[0]?.id);
  });

  it('keeps the selected court', () => {
    const config = normalizeEquipmentConfig({
      activeCourtId: 'q2',
      courts: [
        { id: 'q1', name: 'A', cameras: [], buttons: [], bindings: [] },
        { id: 'q2', name: 'B', cameras: [], buttons: [], bindings: [] },
      ],
    });
    expect(config.activeCourtId).toBe('q2');
    expect(config.courts[1]?.name).toBe('B');
  });
});

describe('keepStoredCloudSecrets', () => {
  it('keeps the stored secret when the save leaves it blank', () => {
    const previous = normalizeEquipmentConfig({
      activeCourtId: 'q1',
      courts: [
        {
          id: 'q1',
          name: 'A',
          cloud: { endpoint: 'https://r2.example', bucket: 'lances', region: 'auto', accessKeyId: 'key', secretAccessKey: 'stored' },
          cameras: [],
          buttons: [],
          bindings: [],
        },
      ],
    });
    const next = normalizeEquipmentConfig({
      ...previous,
      courts: [{ ...previous.courts[0], cloud: { ...previous.courts[0].cloud, secretAccessKey: '  ' } }],
    });
    expect(keepStoredCloudSecrets(previous, next).courts[0]?.cloud.secretAccessKey).toBe('stored');
  });
});
