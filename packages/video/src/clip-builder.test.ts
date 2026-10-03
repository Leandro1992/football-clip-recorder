import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClipBuilder, buildConcatListContent } from './clip-builder';

describe('ClipBuilder', () => {
  it('builds concat list content using ffmpeg-compatible file declarations', () => {
    const content = buildConcatListContent([
      'C:\\clips\\segment_0001.mp4',
      'C:\\clips\\segment_0002.mp4',
    ]);

    expect(content).toContain("file 'C:/clips/segment_0001.mp4'");
    expect(content).toContain("file 'C:/clips/segment_0002.mp4'");
  });

  it('creates an output file path via the injected executor', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-builder-'));
    const outputRoot = path.join(tempRoot, 'clips');
    const tempDir = path.join(tempRoot, 'temp');
    const segmentPath = path.join(tempRoot, 'segment_0001.mp4');
    await fs.writeFile(segmentPath, 'segment');

    const clipBuilder = new ClipBuilder({
      tempDirectory: tempDir,
      executor: async (_command, args) => {
        const outputFilePath = args.at(-1);
        if (!outputFilePath) {
          throw new Error('Missing output path');
        }

        await fs.writeFile(outputFilePath, 'clip');
      },
    });

    const outputFilePath = await clipBuilder.buildClip({
      clipId: 'clip-1',
      targetStart: new Date('2026-01-01T00:00:00.000Z'),
      targetEnd: new Date('2026-01-01T00:00:01.000Z'),
      outputDirectory: outputRoot,
      segments: [
        {
          id: 'segment-1',
          sequence: 1,
          filePath: segmentPath,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          endedAt: new Date('2026-01-01T00:00:01.000Z'),
          durationSeconds: 1,
        },
      ],
    });

    expect(await fs.readFile(outputFilePath, 'utf8')).toBe('clip');
  });
});
