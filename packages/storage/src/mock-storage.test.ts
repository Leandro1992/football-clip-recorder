import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MockStorage } from './mock-storage';
import { createTestLogger } from '../../../tests/test-logger';

describe('MockStorage', () => {
  it('copies a clip to the mock-s3 directory and returns a mock url', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-storage-'));
    const sourceFilePath = path.join(tempRoot, 'clip.mp4');
    const destinationRoot = path.join(tempRoot, 'mock-s3');
    await fs.writeFile(sourceFilePath, 'video-data');

    const storage = new MockStorage({
      rootDirectory: destinationRoot,
      logger: createTestLogger(),
      latencyMs: 1,
    });

    const result = await storage.upload(sourceFilePath, {
      id: 'clip-1',
      timestamp: new Date().toISOString(),
      duration: 33,
      cameraId: 'camera-1',
      filePath: sourceFilePath,
      storageStatus: 'pending',
    });

    const copiedContents = await fs.readFile(path.join(destinationRoot, 'clip.mp4'), 'utf8');
    expect(copiedContents).toBe('video-data');
    expect(result.url).toBe('mock-s3://clip.mp4');
  });
});
