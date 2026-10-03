import type { TriggerButton } from '@football-clip-recorder/core';

/** Fans several trigger sources (e.g. GPIO button and web UI) into a single TriggerButton. */
export class CompositeTriggerButton implements TriggerButton {
  constructor(
    private readonly buttons: TriggerButton[],
    private readonly onStartError?: (error: unknown, button: TriggerButton) => void,
  ) {}

  async start(): Promise<void> {
    // One failing source (e.g. missing GPIO tools) must not disable the others.
    await Promise.all(
      this.buttons.map((button) =>
        button.start().catch((error: unknown) => {
          this.onStartError?.(error, button);
        }),
      ),
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.buttons.map((button) => button.stop()));
  }

  onPress(callback: () => void): void {
    for (const button of this.buttons) {
      button.onPress(callback);
    }
  }
}
