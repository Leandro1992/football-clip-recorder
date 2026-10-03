import { listLinuxAudioDevices, listLinuxCameraDevices } from './device-list-linux';
import {
  buildCameraOutputArguments,
  UsbCameraWindows,
  type UsbCameraWindowsOptions,
} from './usb-camera-windows';

export type UsbCameraLinuxOptions = UsbCameraWindowsOptions;

export function buildV4l2InputArguments(options: {
  fps: number;
  width: number;
  height: number;
  format?: string;
  devicePath: string;
  audioDevice?: string;
}): string[] {
  const format = options.format?.trim().toLowerCase();
  const formatArguments =
    format === 'mjpeg' || format === 'mjpg'
      ? ['-input_format', 'mjpeg']
      : format
        ? ['-input_format', format]
        : [];

  const videoInput = [
    '-f',
    'v4l2',
    '-thread_queue_size',
    '512',
    '-framerate',
    String(options.fps),
    '-video_size',
    `${options.width}x${options.height}`,
    ...formatArguments,
    '-i',
    options.devicePath,
  ];

  if (!options.audioDevice) {
    return videoInput;
  }

  return [
    ...videoInput,
    '-f',
    'alsa',
    '-thread_queue_size',
    '512',
    '-i',
    options.audioDevice,
  ];
}

export class UsbCameraLinux extends UsbCameraWindows {
  protected override buildInputArguments(): string[] {
    return buildV4l2InputArguments({
      fps: this.options.fps,
      width: this.options.width,
      height: this.options.height,
      format: this.options.format,
      devicePath: this.cameraName as string,
      audioDevice: this.audioName,
    });
  }

  protected override buildOutputArguments(segmentPattern: string): string[] {
    return buildCameraOutputArguments({
      segmentDurationSeconds: this.options.segmentDurationSeconds,
      segmentPattern,
      previewImagePath: this.options.previewImagePath,
      includeAudio: Boolean(this.audioName),
      audioGainDb: this.options.audioGainDb,
      audioDenoise: this.options.audioDenoise,
      // The audio device is the second ffmpeg input on Linux (video and audio are separate).
      audioInputIndex: 1,
      keyframeIntervalSeconds: this.options.segmentDurationSeconds,
      segmentStartNumber: this.sequence,
    });
  }

  protected override async detectDefaultCamera(): Promise<string> {
    const devices = await listLinuxCameraDevices();
    if (devices.length === 0) {
      throw new Error('No V4L2 camera devices were found. Check the USB camera and /dev/video*.');
    }

    return devices[0].deviceId;
  }

  protected override async detectDefaultAudio(): Promise<string> {
    const devices = await listLinuxAudioDevices();
    if (devices.length === 0) {
      throw new Error('ENABLE_AUDIO=true, but no ALSA capture device was found (arecord -l).');
    }

    return devices[0].deviceId;
  }
}
