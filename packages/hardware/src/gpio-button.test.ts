import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { buildGpiomonArguments, GpioButton } from './gpio-button';
import { CompositeTriggerButton } from './composite-trigger-button';
import { VirtualButton } from './virtual-button';

describe('buildGpiomonArguments', () => {
  it('builds libgpiod v2 arguments for an active-low button', () => {
    expect(
      buildGpiomonArguments({ majorVersion: 2, chip: 'gpiochip0', pin: 17, activeLow: true, debounceMs: 50 }),
    ).toEqual([
      '--chip', 'gpiochip0', '--edges', 'falling', '--bias', 'pull-up',
      '--debounce-period', '50ms', '17',
    ]);
  });

  it('builds libgpiod v1 arguments for an active-high button', () => {
    expect(
      buildGpiomonArguments({ majorVersion: 1, chip: 'gpiochip0', pin: 17, activeLow: false, debounceMs: 50 }),
    ).toEqual(['--rising-edge', '--bias=pull-down', 'gpiochip0', '17']);
  });
});

describe('GpioButton', () => {
  function fakeProcess() {
    const child = new EventEmitter() as ChildProcessWithoutNullStreams;
    (child as unknown as { stdout: PassThrough }).stdout = new PassThrough();
    (child as unknown as { stderr: PassThrough }).stderr = new PassThrough();
    (child as unknown as { kill: () => boolean }).kill = () => true;
    return child;
  }

  it('fires once per gpiomon event line and debounces bounces', async () => {
    const child = fakeProcess();
    const button = new GpioButton({
      pin: 17,
      libgpiodMajorVersion: 2,
      spawnProcess: () => child,
    });
    const callback = vi.fn();
    button.onPress(callback);

    await button.start();
    child.stdout.emit('data', Buffer.from('1.0 falling "gpiochip0" 17\n1.01 falling "gpiochip0" 17\n'));
    await button.stop();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('CompositeTriggerButton', () => {
  it('forwards presses from every source and survives a failing source', async () => {
    const working = new VirtualButton();
    const failing = { start: () => Promise.reject(new Error('no gpio')), stop: async () => undefined, onPress: () => undefined };
    const onError = vi.fn();
    const composite = new CompositeTriggerButton([working, failing], onError);
    const callback = vi.fn();

    composite.onPress(callback);
    await composite.start();
    working.press();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
