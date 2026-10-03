import type { TriggerButton } from '@football-clip-recorder/core';

export class VirtualButton implements TriggerButton {
  private readonly callbacks = new Set<() => void>();
  private running = false;

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  onPress(callback: () => void): void {
    this.callbacks.add(callback);
  }

  press(): void {
    if (!this.running) {
      return;
    }

    for (const callback of this.callbacks) {
      callback();
    }
  }
}
