import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { BuildClipInput, VideoClipBuilder } from '@football-clip-recorder/core';

export type FFmpegExecutor = (command: string, args: string[]) => Promise<void>;

export interface ClipBuilderOptions {
  ffmpegPath?: string;
  tempDirectory: string;
  executor?: FFmpegExecutor;
}

function resolveClipBuilderExecutable(ffmpegPath?: string): string {
  if (ffmpegPath && ffmpegPath.trim()) {
    return ffmpegPath.trim();
  }

  const fromEnvironment = process.env.FFMPEG_PATH?.trim();
  if (fromEnvironment) {
    return fromEnvironment;
  }

  return 'ffmpeg';
}

export class ClipBuilder implements VideoClipBuilder {
  private readonly ffmpegPath: string;
  private readonly executor: FFmpegExecutor;

  constructor(private readonly options: ClipBuilderOptions) {
    this.ffmpegPath = resolveClipBuilderExecutable(options.ffmpegPath);
    this.executor = options.executor ?? runFFmpeg;
  }

  async buildClip(input: BuildClipInput): Promise<string> {
    if (input.segments.length === 0) {
      throw new Error('Cannot build a clip without buffered segments.');
    }

    await fs.mkdir(input.outputDirectory, { recursive: true });
    await fs.mkdir(this.options.tempDirectory, { recursive: true });

    const concatFilePath = path.join(this.options.tempDirectory, `${input.clipId}.txt`);
    const outputFilePath = path.join(input.outputDirectory, `${input.clipId}.mp4`);

    await fs.writeFile(concatFilePath, buildConcatListContent(input.segments.map((segment) => segment.filePath)));

    try {
      await this.executor(this.ffmpegPath, [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatFilePath,
        '-c',
        'copy',
        outputFilePath,
      ]);
    } finally {
      await fs.rm(concatFilePath, { force: true });
    }

    return outputFilePath;
  }
}

export function buildConcatListContent(filePaths: string[]): string {
  return filePaths
    .map((filePath) => `file '${filePath.replaceAll('\\', '/').replaceAll("'", "\\'")}'`)
    .join('\n');
}

async function runFFmpeg(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    process.on('error', (error) => {
      reject(error);
    });

    process.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with code ${code}. ${stderr}`.trim()));
    });
  });
}
