import { spawn } from 'node:child_process';
import { listLinuxAudioDevices, listLinuxCameraDevices } from './device-list-linux';
import { resolveFfmpegPath } from './ffmpeg-path';

export interface CameraDeviceInfo {
  deviceId: string;
  name: string;
  capabilities?: Record<string, string>;
}

export async function listCameraDevices(ffmpegPath = 'ffmpeg'): Promise<CameraDeviceInfo[]> {
  if (process.platform === 'linux') {
    return listLinuxCameraDevices();
  }

  const stderr = await runFFmpegForDeviceListing(resolveFfmpegPath(ffmpegPath));
  const deviceNames = parseDirectShowVideoDevices(stderr);

  return deviceNames.map((name) => ({
    deviceId: name,
    name,
  }));
}

export async function listAudioDevices(ffmpegPath = 'ffmpeg'): Promise<CameraDeviceInfo[]> {
  if (process.platform === 'linux') {
    return listLinuxAudioDevices();
  }

  const stderr = await runFFmpegForDeviceListing(resolveFfmpegPath(ffmpegPath));
  const deviceNames = parseDirectShowAudioDevices(stderr);

  return deviceNames.map((name) => ({
    deviceId: name,
    name,
  }));
}

export function parseDirectShowVideoDevices(output: string): string[] {
  return parseDirectShowDevicesByType(output, 'video');
}

export function parseDirectShowAudioDevices(output: string): string[] {
  return parseDirectShowDevicesByType(output, 'audio');
}

function parseDirectShowDevicesByType(output: string, deviceType: 'video' | 'audio'): string[] {
  const lines = output.split(/\r?\n/);
  const devices: string[] = [];

  for (const line of lines) {
    const match = line.match(new RegExp(`"(.+)"\\s+\\(${deviceType}\\)`, 'i'));
    if (match?.[1] && !devices.includes(match[1])) {
      devices.push(match[1]);
    }
  }

  return devices;
}

async function runFFmpegForDeviceListing(ffmpegPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(
      ffmpegPath,
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';

    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    process.on('error', (error) => {
      reject(error);
    });

    process.on('exit', () => {
      resolve(stderr);
    });
  });
}
