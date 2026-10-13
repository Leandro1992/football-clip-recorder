import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export type EquipmentButtonType = 'virtual' | 'gpio';

export interface EquipmentCamera {
  id: string;
  name: string;
  deviceId: string;
  isActive: boolean;
}

export interface EquipmentButton {
  id: string;
  name: string;
  type: EquipmentButtonType;
  isActive: boolean;
  gpioPin?: number;
  gpioChip?: string;
  activeLow?: boolean;
}

export interface EquipmentBinding {
  buttonId: string;
  cameraIds: string[];
}

export interface EquipmentConfig {
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: EquipmentBinding[];
}

export const DEFAULT_EQUIPMENT_CONFIG: EquipmentConfig = {
  cameras: [],
  buttons: [],
  bindings: [],
};

function mergeEquipment(base: EquipmentConfig, extra: EquipmentConfig): EquipmentConfig {
  const cameras = new Map(base.cameras.map((camera) => [camera.id, camera]));
  for (const camera of extra.cameras) {
    cameras.set(camera.id, camera);
  }

  const buttons = new Map(base.buttons.map((button) => [button.id, button]));
  for (const button of extra.buttons) {
    buttons.set(button.id, button);
  }

  const bindingsMap = new Map<string, Set<string>>();
  for (const binding of base.bindings) {
    bindingsMap.set(binding.buttonId, new Set(binding.cameraIds));
  }
  for (const binding of extra.bindings) {
    const current = bindingsMap.get(binding.buttonId) ?? new Set<string>();
    for (const cameraId of binding.cameraIds) {
      current.add(cameraId);
    }
    bindingsMap.set(binding.buttonId, current);
  }

  return {
    cameras: [...cameras.values()],
    buttons: [...buttons.values()],
    bindings: [...bindingsMap.entries()].map(([buttonId, cameraIds]) => ({
      buttonId,
      cameraIds: [...cameraIds],
    })),
  };
}

function normalizeConfig(input: unknown): EquipmentConfig {
  if (!input || typeof input !== 'object') {
    return DEFAULT_EQUIPMENT_CONFIG;
  }
  const candidate = input as Partial<EquipmentConfig>;
  return {
    cameras: Array.isArray(candidate.cameras)
      ? candidate.cameras.map((camera) => ({
          ...camera,
          isActive: camera.isActive !== false,
        }))
      : [],
    buttons: Array.isArray(candidate.buttons)
      ? candidate.buttons.map((button) => ({
          ...button,
          isActive: button.isActive !== false,
        }))
      : [],
    bindings: Array.isArray(candidate.bindings) ? candidate.bindings : [],
  };
}

export class EquipmentStore {
  constructor(
    private readonly runtimeRoot: string,
    private readonly defaultConfig: EquipmentConfig = DEFAULT_EQUIPMENT_CONFIG,
  ) {}

  private get filePath(): string {
    return path.join(this.runtimeRoot, 'equipment-config.json');
  }

  async load(): Promise<EquipmentConfig> {
    try {
      const payload = await fs.readFile(this.filePath, 'utf8');
      return mergeEquipment(this.defaultConfig, normalizeConfig(JSON.parse(payload)));
    } catch {
      return normalizeConfig(this.defaultConfig);
    }
  }

  loadSync(): EquipmentConfig {
    try {
      const payload = fsSync.readFileSync(this.filePath, 'utf8');
      return mergeEquipment(this.defaultConfig, normalizeConfig(JSON.parse(payload)));
    } catch {
      return normalizeConfig(this.defaultConfig);
    }
  }

  async save(config: EquipmentConfig): Promise<void> {
    const normalized = mergeEquipment(this.defaultConfig, normalizeConfig(config));
    await fs.mkdir(this.runtimeRoot, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalized, null, 2));
  }
}
