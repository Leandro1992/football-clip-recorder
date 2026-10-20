export interface BindingCamera {
  id: string;
  deviceId: string;
  isActive: boolean;
}

export interface BindingButton {
  id: string;
  type: 'virtual' | 'gpio';
  isActive: boolean;
  gpioPin?: number;
  gpioChip?: string;
}

export interface BindingLink {
  buttonId: string;
  cameraIds: string[];
}

export interface ButtonBindingCatalog {
  cameras: BindingCamera[];
  buttons: BindingButton[];
  bindings: BindingLink[];
}

function activeCameraIds(catalog: ButtonBindingCatalog): Set<string> {
  return new Set(
    catalog.cameras.filter((camera) => camera.isActive && camera.deviceId.trim()).map((camera) => camera.id),
  );
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Active cameras listed on an active button. */
export function cameraIdsForButton(catalog: ButtonBindingCatalog, buttonId: string): string[] {
  const button = catalog.buttons.find((item) => item.id === buttonId);
  if (!button?.isActive) {
    return [];
  }

  const cameras = activeCameraIds(catalog);
  const binding = catalog.bindings.find((item) => item.buttonId === buttonId);
  if (!binding) {
    return [];
  }

  return unique(binding.cameraIds.filter((cameraId) => cameras.has(cameraId)));
}

/**
 * One physical GPIO pin can be saved as more than one catalog button.
 * A press records every active camera tied to any active button on that pin.
 */
export function cameraIdsForGpioPin(catalog: ButtonBindingCatalog, pin: number, chip: string): string[] {
  const normalizedChip = chip || 'gpiochip0';
  const ids: string[] = [];
  for (const button of catalog.buttons) {
    if (button.type !== 'gpio' || !button.isActive || button.gpioPin !== pin) {
      continue;
    }
    if ((button.gpioChip || 'gpiochip0') !== normalizedChip) {
      continue;
    }
    ids.push(...cameraIdsForButton(catalog, button.id));
  }
  return unique(ids);
}
