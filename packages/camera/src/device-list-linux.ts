import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { CameraDeviceInfo } from './device-list';

export function parseV4l2VideoDevices(output: string): CameraDeviceInfo[] {
  const devices: CameraDeviceInfo[] = [];
  let currentName: string | undefined;
  let currentIsUsb = false;
  let currentNodes: string[] = [];

  const flush = (): void => {
    if (currentName && currentIsUsb && currentNodes.length > 0) {
      // UVC cameras expose a capture node first and metadata nodes after it.
      devices.push({ deviceId: currentNodes[0], name: currentName.trim() });
    }
    currentName = undefined;
    currentIsUsb = false;
    currentNodes = [];
  };

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    if (!/^\s/.test(line)) {
      flush();
      const header = line.match(/^(.*?)\s*\(([^)]*)\):\s*$/);
      currentName = header ? header[1] : line.replace(/:\s*$/, '');
      currentIsUsb = header ? header[2].startsWith('usb-') : false;
      continue;
    }

    const node = line.trim();
    if (node.startsWith('/dev/video')) {
      currentNodes.push(node);
    }
  }

  flush();
  return devices;
}

export function parseAlsaCaptureDevices(output: string): CameraDeviceInfo[] {
  const devices: CameraDeviceInfo[] = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^card\s+(\d+):\s*([^\[]*)\[([^\]]*)\],\s*device\s+(\d+):/);
    if (!match) {
      continue;
    }

    devices.push({
      deviceId: `plughw:${match[1]},${match[4]}`,
      name: match[3].trim() || match[2].trim(),
    });
  }

  return devices;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (error, stdout) => {
      if (error && !stdout) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export async function listLinuxCameraDevices(): Promise<CameraDeviceInfo[]> {
  try {
    const devices = parseV4l2VideoDevices(await run('v4l2-ctl', ['--list-devices']));
    if (devices.length > 0) {
      return devices;
    }
  } catch {
    // v4l2-ctl is optional; fall back to scanning device nodes.
  }

  try {
    return fs
      .readdirSync('/dev')
      .filter((name) => /^video\d+$/.test(name))
      .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)))
      .slice(0, 1)
      .map((name) => ({ deviceId: `/dev/${name}`, name: `/dev/${name}` }));
  } catch {
    return [];
  }
}

export async function listLinuxAudioDevices(): Promise<CameraDeviceInfo[]> {
  try {
    return parseAlsaCaptureDevices(await run('arecord', ['-l']));
  } catch {
    return [];
  }
}
