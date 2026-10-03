import path from 'node:path';
import { loadConfig } from './index';

describe('loadConfig', () => {
  it('loads defaults when environment variables are not set', () => {
    const config = loadConfig({
      env: {},
      projectRoot: path.resolve('C:\\football-clip-recorder'),
    });

    expect(config.storage.provider).toBe('mock');
    expect(config.video.bufferDurationSeconds).toBe(30);
    expect(config.camera.width).toBe(1920);
    expect(config.camera.enableAudio).toBe(false);
    expect(config.app.ffmpegPath).toBeUndefined();
    expect(config.paths.previewRoot).toContain('runtime');
  });

  it('applies explicit environment overrides', () => {
    const config = loadConfig({
      env: {
        STORAGE_PROVIDER: 's3',
        AWS_REGION: 'sa-east-1',
        AWS_S3_BUCKET: 'clips',
        BUFFER_DURATION_SECONDS: '45',
        FFMPEG_PATH: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        CAMERA_DEVICE: 'USB Camera',
        AUDIO_DEVICE: 'Microfone (USB Audio)',
        ENABLE_AUDIO: 'true',
      },
      projectRoot: path.resolve('C:\\football-clip-recorder'),
    });

    expect(config.storage.provider).toBe('s3');
    expect(config.storage.awsRegion).toBe('sa-east-1');
    expect(config.video.bufferDurationSeconds).toBe(45);
    expect(config.app.ffmpegPath).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe');
    expect(config.camera.deviceName).toBe('USB Camera');
    expect(config.camera.audioDeviceName).toBe('Microfone (USB Audio)');
    expect(config.camera.enableAudio).toBe(true);
  });

  it('loads GPIO button settings and requires a pin', () => {
    const root = path.resolve('C:\\football-clip-recorder');
    const config = loadConfig({ env: { BUTTON_PROVIDER: 'gpio', GPIO_BUTTON_PIN: '17' }, projectRoot: root });

    expect(config.button).toMatchObject({ provider: 'gpio', gpioPin: 17, gpioChip: 'gpiochip0', activeLow: true });
    expect(config.app.host).toBe('0.0.0.0');
    expect(() => loadConfig({ env: { BUTTON_PROVIDER: 'gpio' }, projectRoot: root })).toThrow('GPIO_BUTTON_PIN');
  });
});
