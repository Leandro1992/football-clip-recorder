import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StorageRetention } from './storage-retention';
import { ConnectivityMonitor } from './connectivity-monitor';
import { createTestLogger } from '../../../tests/test-logger';

async function makeClips(count: number, size: number): Promise<{ dir: string; files: string[] }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'retention-'));
  const files: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const file = path.join(dir, `clip-${index}.mp4`);
    await fs.writeFile(file, Buffer.alloc(size));
    const time = new Date(2024, 0, 1, 0, index);
    await fs.utimes(file, time, time);
    files.push(file);
  }
  return { dir, files };
}

describe('StorageRetention', () => {
  it('keeps clips untouched while under the budget', async () => {
    const { dir } = await makeClips(3, 100);
    const retention = new StorageRetention({
      directory: dir,
      maxPercent: 50,
      logger: createTestLogger(),
      getDiskStats: async () => ({ freeBytes: 1000 }),
    });
    const result = await retention.enforce();
    expect(result.removed).toEqual([]);
    expect(result.budgetBytes).toBe(650);
  });

  it('removes the oldest clips when over the budget', async () => {
    const { dir, files } = await makeClips(4, 100);
    const retention = new StorageRetention({
      directory: dir,
      maxPercent: 50,
      logger: createTestLogger(),
      getDiskStats: async () => ({ freeBytes: 0 }),
    });
    const result = await retention.enforce();
    expect(result.removed).toEqual([files[0], files[1]]);
    expect(await fs.readdir(dir)).toHaveLength(2);
  });

  it('evicts already uploaded clips before pending ones', async () => {
    const { dir, files } = await makeClips(3, 100);
    const retention = new StorageRetention({
      directory: dir,
      maxPercent: 50,
      logger: createTestLogger(),
      getDiskStats: async () => ({ freeBytes: 100 }),
      isUploaded: (file) => file === files[2],
    });
    const result = await retention.enforce();
    expect(result.removed[0]).toBe(files[2]);
  });
});

describe('ConnectivityMonitor', () => {
  it('notifies only when connectivity changes', async () => {
    const answers = [false, false, true, true, false];
    const monitor = new ConnectivityMonitor({
      url: 'http://x',
      intervalMs: 1000,
      check: async () => answers.shift() as boolean,
    });
    const events: boolean[] = [];
    monitor.onChange((online) => events.push(online));
    for (let index = 0; index < 5; index += 1) {
      await monitor.probe();
    }
    expect(events).toEqual([false, true, false]);
  });
});
