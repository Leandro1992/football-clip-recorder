import { listCameraDevices } from '../device-list';

async function main(): Promise<void> {
  const devices = await listCameraDevices();

  if (devices.length === 0) {
    console.log('No camera devices detected.');
    return;
  }

  for (const device of devices) {
    console.log(`${device.deviceId} :: ${device.name}`);
  }
}

void main();
