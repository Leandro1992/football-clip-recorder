import { UploadQueue } from './upload-queue';
import { createTestLogger } from '../../../tests/test-logger';
import type { ClipMetadata, ClipStorage, UploadResult } from './index';

describe('UploadQueue', () => {
  it('uploads queued clips sequentially', async () => {
    const processedIds: string[] = [];
    const storage: ClipStorage = {
      async upload(_filePath: string, metadata: ClipMetadata): Promise<UploadResult> {
        processedIds.push(metadata.id);
        return { provider: 'mock', url: `mock-s3://${metadata.id}.mp4` };
      },
    };

    const queue = new UploadQueue(storage, createTestLogger());
    const updatedClips: ClipMetadata[] = [];
    queue.onClipUpdated((clip) => {
      updatedClips.push(clip);
    });

    queue.enqueue({
      id: 'clip-1',
      timestamp: new Date().toISOString(),
      duration: 33,
      cameraId: 'camera-1',
      filePath: 'clip-1.mp4',
      storageStatus: 'pending',
    });
    queue.enqueue({
      id: 'clip-2',
      timestamp: new Date().toISOString(),
      duration: 33,
      cameraId: 'camera-1',
      filePath: 'clip-2.mp4',
      storageStatus: 'pending',
    });

    await vi.waitFor(() => {
      expect(processedIds).toEqual(['clip-1', 'clip-2']);
    });
    expect(updatedClips.at(-1)?.storageStatus).toBe('uploaded');
  });

  it('returns clips to pending when upload fails', async () => {
    const storage: ClipStorage = {
      async upload(): Promise<UploadResult> {
        throw new Error('upload failed');
      },
    };

    const queue = new UploadQueue(storage, createTestLogger());
    const updates: ClipMetadata[] = [];
    queue.onClipUpdated((clip) => {
      updates.push(clip);
    });

    queue.enqueue({
      id: 'clip-3',
      timestamp: new Date().toISOString(),
      duration: 33,
      cameraId: 'camera-1',
      filePath: 'clip-3.mp4',
      storageStatus: 'pending',
    });

    await vi.waitFor(() => {
      expect(updates.length).toBeGreaterThan(0);
    });

    expect(updates.at(-1)?.storageStatus).toBe('pending');
    expect(updates.at(-1)?.lastError).toBe('upload failed');
  });
});
