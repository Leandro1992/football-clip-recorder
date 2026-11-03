import { execFile } from 'node:child_process';

export const UPDATE_HELPER_PATH = '/usr/local/sbin/olho-update';

export const VERSION_UPDATE_UNAVAILABLE = 'A atualização pela interface só existe no Raspberry Pi.';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (args: string[]) => Promise<CommandResult>;

export interface VersionCommit {
  hash: string;
  subject: string;
}

export interface VersionStatus {
  available: boolean;
  message?: string;
  current?: VersionCommit;
  remote?: VersionCommit;
  updateAvailable: boolean;
  updating: boolean;
}

export interface UpdateStartResult {
  ok: boolean;
  message: string;
}

export function parseAheadBehind(text: string): { ahead: number; behind: number } | undefined {
  const match = text.trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) {
    return undefined;
  }
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    return undefined;
  }
  return { ahead, behind };
}

export function redactGitError(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s]+@/gi, '$1');
}

export function describeVersionGap(ahead: number, behind: number): { updateAvailable: boolean; message: string } {
  if (ahead === 0 && behind === 0) {
    return { updateAvailable: false, message: 'Este aparelho já está na main.' };
  }
  if (ahead === 0 && behind > 0) {
    return {
      updateAvailable: true,
      message: `A main tem ${behind} ${behind === 1 ? 'commit novo' : 'commits novos'}.`,
    };
  }
  if (ahead > 0 && behind === 0) {
    return { updateAvailable: false, message: 'Este aparelho tem commits que ainda não estão na main.' };
  }
  return {
    updateAvailable: false,
    message: 'A história deste aparelho divergiu da main. A atualização pela interface não mistura as duas.',
  };
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

function failureMessage(result: CommandResult): string {
  const detail = redactGitError(`${result.stderr}\n${result.stdout}`).trim();
  if (detail.length === 0) {
    return 'Não foi possível consultar a main.';
  }
  return detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
}

export function createAppUpdateRunner(repoRoot: string, helperPath = UPDATE_HELPER_PATH): CommandRunner {
  return (args) =>
    new Promise((resolve) => {
      const [command, commandArgs] =
        args[0] === 'update-helper'
          ? ['sudo', ['-n', helperPath]]
          : args[0] === 'systemctl'
            ? ['systemctl', args.slice(1)]
            : ['git', ['-C', repoRoot, ...args]];
      execFile(
        command,
        commandArgs,
        {
          timeout: 45_000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
            return;
          }
          const errno = error as NodeJS.ErrnoException;
          const code = typeof errno.code === 'number' ? errno.code : 1;
          const extra = typeof errno.code === 'string' ? error.message : '';
          resolve({ code, stdout: stdout ?? '', stderr: `${stderr ?? ''}${extra}` });
        },
      );
    });
}

export class AppUpdate {
  constructor(
    private readonly runner: CommandRunner,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async status(): Promise<VersionStatus> {
    if (this.platform !== 'linux') {
      return { available: false, updateAvailable: false, updating: false, message: VERSION_UPDATE_UNAVAILABLE };
    }
    const fetched = await this.runner(['fetch', 'origin', 'main']);
    if (fetched.code !== 0) {
      return {
        available: true,
        updateAvailable: false,
        updating: false,
        message: failureMessage(fetched),
      };
    }
    const [currentHash, remoteHash, currentSubject, remoteSubject, counts, active] = await Promise.all([
      this.runner(['rev-parse', '--short=7', 'HEAD']),
      this.runner(['rev-parse', '--short=7', 'origin/main']),
      this.runner(['log', '-1', '--format=%s', 'HEAD']),
      this.runner(['log', '-1', '--format=%s', 'origin/main']),
      this.runner(['rev-list', '--left-right', '--count', 'HEAD...origin/main']),
      this.runner(['systemctl', 'is-active', 'olho-update.service']),
    ]);
    if (currentHash.code !== 0 || remoteHash.code !== 0 || counts.code !== 0) {
      return {
        available: true,
        updateAvailable: false,
        updating: false,
        message: failureMessage(counts.code !== 0 ? counts : remoteHash.code !== 0 ? remoteHash : currentHash),
      };
    }
    const gap = parseAheadBehind(counts.stdout);
    if (!gap) {
      return { available: true, updateAvailable: false, updating: false, message: 'Não foi possível comparar com a main.' };
    }
    const described = describeVersionGap(gap.ahead, gap.behind);
    const updating = ['active', 'activating'].includes(firstLine(active.stdout));
    return {
      available: true,
      updateAvailable: described.updateAvailable && !updating,
      updating,
      message: updating ? 'Atualização em andamento. A página volta quando o serviço reiniciar.' : described.message,
      current: { hash: firstLine(currentHash.stdout), subject: firstLine(currentSubject.stdout) },
      remote: { hash: firstLine(remoteHash.stdout), subject: firstLine(remoteSubject.stdout) },
    };
  }

  async start(): Promise<UpdateStartResult> {
    if (this.platform !== 'linux') {
      return { ok: false, message: VERSION_UPDATE_UNAVAILABLE };
    }
    const active = await this.runner(['systemctl', 'is-active', 'olho-update.service']);
    if (['active', 'activating'].includes(firstLine(active.stdout))) {
      return { ok: false, message: 'A atualização já está em andamento.' };
    }
    const counts = await this.runner(['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
    const gap = counts.code === 0 ? parseAheadBehind(counts.stdout) : undefined;
    if (!gap || gap.ahead !== 0 || gap.behind === 0) {
      return { ok: false, message: 'Não há uma atualização simples disponível na main.' };
    }
    const started = await this.runner(['update-helper']);
    if (started.code !== 0) {
      return { ok: false, message: failureMessage(started) };
    }
    return {
      ok: true,
      message: 'A atualização começou. A câmera para por alguns segundos e a página volta em seguida.',
    };
  }
}
