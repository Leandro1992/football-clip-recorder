import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { VideoBuffer } from './video-buffer';
import { createTestLogger } from '../../../tests/test-logger';

describe('VideoBuffer', () => {
  it('keeps only the configured buffer window', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'video-buffer-'));
    const buffer = new VideoBuffer({
      bufferDurationSeconds: 3,
      logger: createTestLogger(),
    });
    const baseTime = new Date('2026-01-01T00:00:00.000Z');

    for (let index = 0; index < 5; index += 1) {
      const filePath = path.join(tempRoot, `segment-${index}.mp4`);
      await fs.writeFile(filePath, 'segment');
      await buffer.addSegment({
        id: `segment-${index}`,
        sequence: index,
        filePath,
        startedAt: new Date(baseTime.getTime() + index * 1000),
        endedAt: new Date(baseTime.getTime() + (index + 1) * 1000),
        durationSeconds: 1,
      });
    }

    const segments = buffer.getSegmentsForInterval(
      new Date(baseTime.getTime()),
      new Date(baseTime.getTime() + 5000),
    );

    expect(segments.map((segment) => segment.id)).toEqual(['segment-2', 'segment-3', 'segment-4']);
  });

  it('waits until the target time is covered by buffered segments', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'video-buffer-wait-'));
    const buffer = new VideoBuffer({
      bufferDurationSeconds: 10,
      logger: createTestLogger(),
    });
    const baseTime = new Date('2026-01-01T00:00:00.000Z');
    const waiter = buffer.waitForTime(new Date(baseTime.getTime() + 2000));

    for (let index = 0; index < 2; index += 1) {
      const filePath = path.join(tempRoot, `segment-${index}.mp4`);
      await fs.writeFile(filePath, 'segment');
      await buffer.addSegment({
        id: `segment-${index}`,
        sequence: index,
        filePath,
        startedAt: new Date(baseTime.getTime() + index * 1000),
        endedAt: new Date(baseTime.getTime() + (index + 1) * 1000),
        durationSeconds: 1,
      });
    }

    await waiter;
  });
});
