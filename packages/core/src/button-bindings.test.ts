import { cameraIdsForButton, cameraIdsForGpioPin, type ButtonBindingCatalog } from './button-bindings';

const catalog: ButtonBindingCatalog = {
  cameras: [
    { id: 'main', deviceId: '/dev/video0', isActive: true },
    { id: 'extra', deviceId: '/dev/video2', isActive: true },
    { id: 'off', deviceId: '/dev/video4', isActive: false },
  ],
  buttons: [
    { id: 'goal', type: 'gpio', isActive: true, gpioPin: 17, gpioChip: 'gpiochip0' },
    { id: 'goal-again', type: 'gpio', isActive: true, gpioPin: 17, gpioChip: 'gpiochip0' },
    { id: 'other', type: 'gpio', isActive: true, gpioPin: 22, gpioChip: 'gpiochip0' },
  ],
  bindings: [
    { buttonId: 'goal', cameraIds: ['main'] },
    { buttonId: 'goal-again', cameraIds: ['extra', 'off'] },
    { buttonId: 'other', cameraIds: ['extra'] },
  ],
};

describe('cameraIdsForButton', () => {
  it('returns every active camera listed on that button', () => {
    const shared: ButtonBindingCatalog = {
      ...catalog,
      bindings: [{ buttonId: 'goal', cameraIds: ['main', 'extra', 'off'] }],
    };

    expect(cameraIdsForButton(shared, 'goal')).toEqual(['main', 'extra']);
  });
});

describe('cameraIdsForGpioPin', () => {
  it('unions cameras from every active button on the same pin', () => {
    expect(cameraIdsForGpioPin(catalog, 17, 'gpiochip0')).toEqual(['main', 'extra']);
  });

  it('keeps a different pin separate', () => {
    expect(cameraIdsForGpioPin(catalog, 22, 'gpiochip0')).toEqual(['extra']);
  });
});
