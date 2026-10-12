export interface ConnectivityMonitorOptions {
  url: string;
  intervalMs: number;
  timeoutMs?: number;
  check?: (url: string, timeoutMs: number) => Promise<boolean>;
}

type Listener = (online: boolean) => void;

async function defaultCheck(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** Periodically probes internet reachability and notifies listeners when it changes. */
export class ConnectivityMonitor {
  private readonly listeners = new Set<Listener>();
  private timer?: NodeJS.Timeout;
  private online = false;
  private checked = false;

  constructor(private readonly options: ConnectivityMonitorOptions) {}

  isOnline(): boolean {
    return this.online;
  }

  onChange(listener: Listener): void {
    this.listeners.add(listener);
  }

  start(): void {
    if (this.timer) {
      return;
    }
    void this.probe();
    this.timer = setInterval(() => void this.probe(), this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async probe(): Promise<boolean> {
    const check = this.options.check ?? defaultCheck;
    const online = await check(this.options.url, this.options.timeoutMs ?? 5000);
    if (!this.checked || online !== this.online) {
      this.checked = true;
      this.online = online;
      for (const listener of this.listeners) {
        listener(online);
      }
    }
    return online;
  }
}
