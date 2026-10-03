import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Logger, TriggerButton } from '@football-clip-recorder/core';

export interface GpioButtonOptions {
  pin: number;
  chip?: string;
  /** Wired to ground with the internal pull-up enabled (default). Set false for active-high buttons. */
  activeLow?: boolean;
  debounceMs?: number;
  restartDelayMs?: number;
  gpiomonPath?: string;
  logger?: Logger;
  /** Overrides gpiomon detection; mainly useful for tests. */
  libgpiodMajorVersion?: number;
  spawnProcess?: (command: string, args: string[]) => ChildProcessWithoutNullStreams;
}

export function buildGpiomonArguments(options: {
  majorVersion: number;
  chip: string;
  pin: number;
  activeLow: boolean;
  debounceMs: number;
}): string[] {
  const bias = options.activeLow ? 'pull-up' : 'pull-down';

  if (options.majorVersion >= 2) {
    return [
      '--chip',
      options.chip,
      '--edges',
      options.activeLow ? 'falling' : 'rising',
      '--bias',
      bias,
      '--debounce-period',
      `${Math.max(1, Math.min(options.debounceMs, 100))}ms`,
      '--line-buffered',
      String(options.pin),
    ];
  }

  return [
    options.activeLow ? '--falling-edge' : '--rising-edge',
    `--bias=${bias}`,
    options.chip,
    String(options.pin),
  ];
}

function detectLibgpiodMajorVersion(gpiomonPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(gpiomonPath, ['--version'], (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      const match = output.match(/v(\d+)\./);
      if (match) {
        resolve(Number(match[1]));
        return;
      }

      reject(error ?? new Error(`Could not detect libgpiod version from: ${output.trim()}`));
    });
  });
}

/**
 * Physical button on a Raspberry Pi GPIO line, read through libgpiod's `gpiomon`
 * (apt install gpiod). This avoids native Node addons and works on Pi 4 and Pi 5.
 */
export class GpioButton implements TriggerButton {
  private readonly callbacks = new Set<() => void>();
  private process?: ChildProcessWithoutNullStreams;
  private restartTimer?: NodeJS.Timeout;
  private running = false;
  private lastPressAt = 0;
  private majorVersion?: number;

  constructor(private readonly options: GpioButtonOptions) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.majorVersion =
      this.options.libgpiodMajorVersion ??
      (await detectLibgpiodMajorVersion(this.options.gpiomonPath ?? 'gpiomon'));
    this.running = true;
    this.launch();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }

    this.process?.kill();
    this.process = undefined;
  }

  onPress(callback: () => void): void {
    this.callbacks.add(callback);
  }

  private launch(): void {
    const command = this.options.gpiomonPath ?? 'gpiomon';
    const args = buildGpiomonArguments({
      majorVersion: this.majorVersion ?? 1,
      chip: this.options.chip ?? 'gpiochip0',
      pin: this.options.pin,
      activeLow: this.options.activeLow ?? true,
      debounceMs: this.options.debounceMs ?? 50,
    });

    const child = (this.options.spawnProcess ?? spawn)(command, args) as ChildProcessWithoutNullStreams;
    this.process = child;
    this.options.logger?.info('GPIO_BUTTON_STARTED', { command, args });

    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          this.handleEdge();
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.options.logger?.warn('GPIO_BUTTON_STDERR', { message: chunk.toString().trim() });
    });

    child.on('error', (error: Error) => {
      this.options.logger?.error('GPIO_BUTTON_ERROR', { error: error.message });
      this.scheduleRestart();
    });

    child.on('exit', (code: number | null) => {
      if (this.process === child) {
        this.process = undefined;
      }

      if (this.running) {
        this.options.logger?.warn('GPIO_BUTTON_EXITED', { code });
        this.scheduleRestart();
      }
    });
  }

  private scheduleRestart(): void {
    if (!this.running || this.restartTimer) {
      return;
    }

    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (this.running && !this.process) {
        this.launch();
      }
    }, this.options.restartDelayMs ?? 3000);
  }

  private handleEdge(): void {
    const now = Date.now();
    // Mechanical buttons bounce; also avoid double-triggers from a long press.
    if (now - this.lastPressAt < Math.max(this.options.debounceMs ?? 50, 300)) {
      return;
    }

    this.lastPressAt = now;
    for (const callback of this.callbacks) {
      callback();
    }
  }
}
