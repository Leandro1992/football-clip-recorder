import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_FFMPEG_CANDIDATE_PATHS = [
  'C:/Program Files/FFmpeg/bin/ffmpeg.exe',
  'C:/Program Files (x86)/FFmpeg/bin/ffmpeg.exe',
  'C:/ffmpeg/bin/ffmpeg.exe',
  'C:/tools/ffmpeg/bin/ffmpeg.exe',
];

function isFile(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function normalizeCandidatePath(fileOrDirectoryPath: string): string {
  return fileOrDirectoryPath.replace(/\\/g, '/');
}

function appendExecutable(fileOrDirectoryPath: string): string {
  const normalized = normalizeCandidatePath(fileOrDirectoryPath);
  if (normalized.toLowerCase().endsWith('ffmpeg.exe')) {
    return normalized;
  }

  return `${normalized.replace(/\/$/, '')}/ffmpeg.exe`;
}

const POSIX_FFMPEG_CANDIDATE_PATHS = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'];

function getPathCandidatesFromEnvironment(): string[] {
  if (process.platform !== 'win32') {
    return (process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) => path.join(entry, 'ffmpeg'));
  }

  const pathEntries = [
    ...((process.env.Path ?? '').split(';').filter(Boolean)),
    ...((process.env.PATH ?? '').split(';').filter(Boolean)),
    ...((process.env.path ?? '').split(';').filter(Boolean)),
  ];

  return pathEntries.map((entry) => appendExecutable(entry));
}

function getWingetCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const wingetPackagesRoot = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (!fs.existsSync(wingetPackagesRoot)) {
    return [];
  }

  const packageDirectories = fs
    .readdirSync(wingetPackagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('Gyan.FFmpeg_'))
    .map((entry) => path.join(wingetPackagesRoot, entry.name));

  return packageDirectories.flatMap((packageDirectory) => {
    const extractedDirectory = fs
      .readdirSync(packageDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .find((entry) => /ffmpeg/i.test(entry.name));

    if (!extractedDirectory) {
      return [];
    }

    return [path.join(packageDirectory, extractedDirectory.name, 'bin', 'ffmpeg.exe')];
  });
}

function getFallbackCandidates(): string[] {
  if (process.platform !== 'win32') {
    return POSIX_FFMPEG_CANDIDATE_PATHS;
  }

  return WINDOWS_FFMPEG_CANDIDATE_PATHS.map((entry) => normalizeCandidatePath(entry));
}

export function resolveFfmpegPath(configuredPath?: string): string {
  const candidates = [
    configuredPath,
    process.env.FFMPEG_PATH,
    ...getPathCandidatesFromEnvironment(),
    ...(process.platform === 'win32' ? getWingetCandidates() : []),
    ...getFallbackCandidates(),
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => path.normalize(candidate));

  for (const candidate of candidates) {
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return 'ffmpeg';
}
