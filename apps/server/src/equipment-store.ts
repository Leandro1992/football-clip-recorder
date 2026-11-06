import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { isCatalogEquipmentConfig, normalizeEquipmentConfig, type EquipmentConfig } from '@football-clip-recorder/core';

export type {
  Court,
  CourtCloud,
  EquipmentBinding,
  EquipmentButton,
  EquipmentCamera,
  EquipmentConfig,
} from '@football-clip-recorder/core';

export class EquipmentStore {
  constructor(
    private readonly runtimeRoot: string,
    private readonly defaultConfig: EquipmentConfig,
  ) {}

  private get filePath(): string {
    return path.join(this.runtimeRoot, 'equipment-config.json');
  }

  async load(): Promise<EquipmentConfig> {
    return this.loadSync();
  }

  loadSync(): EquipmentConfig {
    const { config, persist } = this.readFromDisk();
    if (persist) {
      this.writeSync(config);
    }
    return config;
  }

  private readFromDisk(): { config: EquipmentConfig; persist: boolean } {
    let payload: string;
    try {
      payload = fsSync.readFileSync(this.filePath, 'utf8');
    } catch {
      return { config: normalizeEquipmentConfig(this.defaultConfig), persist: true };
    }
    try {
      const parsed: unknown = JSON.parse(payload);
      return { config: normalizeEquipmentConfig(parsed), persist: !isCatalogEquipmentConfig(parsed) };
    } catch {
      return { config: normalizeEquipmentConfig(this.defaultConfig), persist: false };
    }
  }

  private writeSync(config: EquipmentConfig): void {
    const normalized = normalizeEquipmentConfig(config);
    fsSync.mkdirSync(this.runtimeRoot, { recursive: true });
    fsSync.writeFileSync(this.filePath, JSON.stringify(normalized, null, 2));
  }

  async save(config: EquipmentConfig): Promise<void> {
    const normalized = normalizeEquipmentConfig(config);
    await fs.mkdir(this.runtimeRoot, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalized, null, 2));
  }
}
