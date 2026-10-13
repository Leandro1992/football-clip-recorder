import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export type EquipmentButtonType = 'virtual' | 'gpio';

export interface EquipmentCamera {
  id: string;
  name: string;
  deviceId: string;
}

export interface EquipmentButton {
  id: string;
  name: string;
  type: EquipmentButtonType;
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

function normalizeConfig(input: unknown): EquipmentConfig {
  if (!input || typeof input !== 'object') {
    return DEFAULT_EQUIPMENT_CONFIG;
  }
  const candidate = input as Partial<EquipmentConfig>;
  return {
    cameras: Array.isArray(candidate.cameras) ? candidate.cameras : [],
    buttons: Array.isArray(candidate.buttons) ? candidate.buttons : [],
    bindings: Array.isArray(candidate.bindings) ? candidate.bindings : [],
  };
}

export class EquipmentStore {
  constructor(private readonly runtimeRoot: string) {}

  private get filePath(): string {
    return path.join(this.runtimeRoot, 'equipment-config.json');
  }

  async load(): Promise<EquipmentConfig> {
    try {
      const payload = await fs.readFile(this.filePath, 'utf8');
      return normalizeConfig(JSON.parse(payload));
    } catch {
      return { ...DEFAULT_EQUIPMENT_CONFIG };
    }
  }

  loadSync(): EquipmentConfig {
    try {
      const payload = fsSync.readFileSync(this.filePath, 'utf8');
      return normalizeConfig(JSON.parse(payload));
    } catch {
      return { ...DEFAULT_EQUIPMENT_CONFIG };
    }
  }

  async save(config: EquipmentConfig): Promise<void> {
    const normalized = normalizeConfig(config);
    await fs.mkdir(this.runtimeRoot, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalized, null, 2));
  }
}
