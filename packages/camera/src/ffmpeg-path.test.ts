import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveFfmpegPath } from './ffmpeg-path';

describe('resolveFfmpegPath', () => {
  it('prefers an explicit configured ffmpeg path when it exists', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-path-'));
    const ffmpegPath = path.join(tempRoot, 'ffmpeg.exe');
    await fs.writeFile(ffmpegPath, '');

    expect(resolveFfmpegPath(ffmpegPath)).toBe(ffmpegPath);
  });
});
