import { VirtualButton } from './virtual-button';

describe('VirtualButton', () => {
  it('fires registered callbacks when pressed', async () => {
    const button = new VirtualButton();
    const callback = vi.fn();

    button.onPress(callback);
    await button.start();
    button.press();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not fire callbacks when stopped', async () => {
    const button = new VirtualButton();
    const callback = vi.fn();

    button.onPress(callback);
    await button.start();
    await button.stop();
    button.press();

    expect(callback).not.toHaveBeenCalled();
  });
});
