import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export type StorageProvider = 'mock' | 's3';
export type ButtonProvider = 'virtual' | 'gpio';

export interface AppConfig {
  app: {
    host: string;
    port?: number;
    ffmpegPath?: string;
  };
  button: {
    provider: ButtonProvider;
    gpioChip: string;
    gpioPin?: number;
    activeLow: boolean;
    debounceMs: number;
  };
  camera: {
    deviceName?: string;
    audioDeviceName?: string;
    enableAudio: boolean;
    audioGainDb: number;
    audioDenoise: boolean;
    width: number;
    height: number;
    fps: number;
    format?: string;
  };
  video: {
    bufferDurationSeconds: number;
    postEventDurationSeconds: number;
    segmentDurationSeconds: number;
  };
  storage: {
    provider: StorageProvider;
    awsRegion?: string;
    awsS3Bucket?: string;
  };
  paths: {
    projectRoot: string;
    runtimeRoot: string;
    segmentsRoot: string;
    clipsRoot: string;
    previewRoot: string;
    mockS3Root: string;
    tempRoot: string;
  };
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
}

function parseOptionalInteger(value: string | undefined, fieldName: string): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${fieldName}: ${value}`);
  }

  return parsed;
}

function parseRequiredPositiveInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  const parsed = parseOptionalInteger(value, fieldName) ?? fallback;
  if (parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero`);
  }
  return parsed;
}

function parseOptionalBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const projectRoot = options.projectRoot ?? process.cwd();
  const envFilePath = path.join(projectRoot, '.env');
  const fileEnv =
    fs.existsSync(envFilePath) && fs.statSync(envFilePath).isFile()
      ? dotenv.parse(fs.readFileSync(envFilePath))
      : {};
  const env = {
    ...fileEnv,
    ...process.env,
    ...options.env,
  };

  const buttonProvider = (env.BUTTON_PROVIDER || 'virtual') as ButtonProvider;
  if (buttonProvider !== 'virtual' && buttonProvider !== 'gpio') {
    throw new Error(`Unsupported BUTTON_PROVIDER: ${buttonProvider}`);
  }

  const gpioPin = parseOptionalInteger(env.GPIO_BUTTON_PIN, 'GPIO_BUTTON_PIN');
  if (buttonProvider === 'gpio' && gpioPin === undefined) {
    throw new Error('GPIO_BUTTON_PIN is required when BUTTON_PROVIDER=gpio');
  }

  const provider = (env.STORAGE_PROVIDER ?? 'mock') as StorageProvider;
  if (provider !== 'mock' && provider !== 's3') {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
  }

  return {
    app: {
      host: env.HOST || '0.0.0.0',
      port: parseOptionalInteger(env.PORT, 'PORT'),
      ffmpegPath: env.FFMPEG_PATH || undefined,
    },
    button: {
      provider: buttonProvider,
      gpioChip: env.GPIO_CHIP || 'gpiochip0',
      gpioPin,
      activeLow: parseOptionalBoolean(env.GPIO_ACTIVE_LOW, true),
      debounceMs: parseRequiredPositiveInteger(env.GPIO_DEBOUNCE_MS, 50, 'GPIO_DEBOUNCE_MS'),
    },
    camera: {
      deviceName: env.CAMERA_DEVICE || undefined,
      audioDeviceName: env.AUDIO_DEVICE || undefined,
      enableAudio: parseOptionalBoolean(env.ENABLE_AUDIO, false),
      audioGainDb: Number(env.AUDIO_GAIN_DB || 0) || 0,
      audioDenoise: parseOptionalBoolean(env.AUDIO_DENOISE, false),
      width: parseRequiredPositiveInteger(env.VIDEO_WIDTH, 1920, 'VIDEO_WIDTH'),
      height: parseRequiredPositiveInteger(env.VIDEO_HEIGHT, 1080, 'VIDEO_HEIGHT'),
      fps: parseRequiredPositiveInteger(env.VIDEO_FPS, 30, 'VIDEO_FPS'),
      format: env.VIDEO_FORMAT || undefined,
    },
    video: {
      bufferDurationSeconds: parseRequiredPositiveInteger(
        env.BUFFER_DURATION_SECONDS,
        30,
        'BUFFER_DURATION_SECONDS',
      ),
      postEventDurationSeconds: parseRequiredPositiveInteger(
        env.POST_EVENT_DURATION_SECONDS,
        3,
        'POST_EVENT_DURATION_SECONDS',
      ),
      segmentDurationSeconds: parseRequiredPositiveInteger(
        env.SEGMENT_DURATION_SECONDS,
        1,
        'SEGMENT_DURATION_SECONDS',
      ),
    },
    storage: {
      provider,
      awsRegion: env.AWS_REGION || undefined,
      awsS3Bucket: env.AWS_S3_BUCKET || undefined,
    },
    paths: {
      projectRoot,
      runtimeRoot: path.join(projectRoot, 'runtime'),
      segmentsRoot: path.join(projectRoot, 'runtime', 'segments'),
      clipsRoot: path.join(projectRoot, 'runtime', 'clips'),
      previewRoot: path.join(projectRoot, 'runtime', 'preview'),
      mockS3Root: path.join(projectRoot, 'mock-s3'),
      tempRoot: path.join(projectRoot, 'runtime', 'temp'),
    },
  };
}

export function ensureRuntimeDirectories(config: AppConfig): void {
  for (const directoryPath of [
    config.paths.runtimeRoot,
    config.paths.segmentsRoot,
    config.paths.clipsRoot,
    config.paths.previewRoot,
    config.paths.mockS3Root,
    config.paths.tempRoot,
  ]) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}
