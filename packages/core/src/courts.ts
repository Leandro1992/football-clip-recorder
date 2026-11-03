export interface EquipmentCamera {
  id: string;
  name: string;
  deviceId: string;
  isActive: boolean;
}

export interface EquipmentButton {
  id: string;
  name: string;
  type: 'virtual' | 'gpio';
  isActive: boolean;
  gpioPin?: number;
  gpioChip?: string;
  activeLow?: boolean;
}

export interface EquipmentBinding {
  buttonId: string;
  cameraIds: string[];
}

export interface CourtCloud {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Court {
  id: string;
  name: string;
  cloud: CourtCloud;
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: EquipmentBinding[];
}

export interface EquipmentConfig {
  activeCourtId: string;
  courts: Court[];
}

export interface CourtCatalog {
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: EquipmentBinding[];
}

export const EMPTY_COURT_CLOUD: CourtCloud = {
  endpoint: '',
  bucket: '',
  region: 'auto',
  accessKeyId: '',
  secretAccessKey: '',
};

const DEFAULT_COURT_ID = 'quadra-principal';

const ACCENTS: Record<string, string> = {
  á: 'a',
  à: 'a',
  ã: 'a',
  â: 'a',
  é: 'e',
  ê: 'e',
  í: 'i',
  ó: 'o',
  õ: 'o',
  ô: 'o',
  ú: 'u',
  ç: 'c',
};

export function slugPart(value: string, fallback: string): string {
  const folded = value
    .trim()
    .toLowerCase()
    .replace(/[áàãâéêíóõôúç]/g, (char) => ACCENTS[char] ?? char);
  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

export function formatClipStamp(triggeredAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${triggeredAt.getFullYear()}${pad(triggeredAt.getMonth() + 1)}${pad(triggeredAt.getDate())}-${pad(triggeredAt.getHours())}${pad(triggeredAt.getMinutes())}${pad(triggeredAt.getSeconds())}`;
}

export function buildClipFileName(input: {
  courtName: string;
  cameraName: string;
  courtId: string;
  triggeredAt: Date;
}): string {
  return [
    slugPart(input.courtName, 'quadra'),
    slugPart(input.cameraName, 'camera'),
    formatClipStamp(input.triggeredAt),
    slugPart(input.courtId, 'quadra'),
  ].join('__');
}

export function courtIdFromClipName(fileName: string): string | undefined {
  const base = fileName.replace(/\.mp4$/i, '');
  const parts = base.split('__');
  if (parts.length < 4) {
    return undefined;
  }
  const stamp = parts[parts.length - 2] ?? '';
  const courtId = parts[parts.length - 1] ?? '';
  if (!/^\d{8}-\d{6}$/.test(stamp) || !courtId) {
    return undefined;
  }
  return courtId;
}

export function isCourtCloudReady(cloud: CourtCloud): boolean {
  return Boolean(cloud.endpoint.trim() && cloud.bucket.trim() && cloud.accessKeyId.trim() && cloud.secretAccessKey.trim());
}

export function activeCourt(config: EquipmentConfig): Court {
  return config.courts.find((court) => court.id === config.activeCourtId) ?? config.courts[0];
}

export function activeCourtCatalog(config: EquipmentConfig): CourtCatalog {
  const court = activeCourt(config);
  return { cameras: court.cameras, buttons: court.buttons, bindings: court.bindings };
}

export function mapActiveCourt(config: EquipmentConfig, updater: (court: Court) => Court): EquipmentConfig {
  const selectedId = activeCourt(config).id;
  return {
    ...config,
    activeCourtId: selectedId,
    courts: config.courts.map((court) => (court.id === selectedId ? updater(court) : court)),
  };
}

export function keepStoredCloudSecrets(previous: EquipmentConfig, next: EquipmentConfig): EquipmentConfig {
  const stored = new Map(previous.courts.map((court) => [court.id, court.cloud.secretAccessKey]));
  return {
    ...next,
    courts: next.courts.map((court) => {
      if (court.cloud.secretAccessKey.trim()) {
        return court;
      }
      const secret = stored.get(court.id);
      if (!secret) {
        return court;
      }
      return { ...court, cloud: { ...court.cloud, secretAccessKey: secret } };
    }),
  };
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeCloud(input: unknown): CourtCloud {
  if (!input || typeof input !== 'object') {
    return { ...EMPTY_COURT_CLOUD };
  }
  const cloud = input as Partial<CourtCloud>;
  return {
    endpoint: asText(cloud.endpoint),
    bucket: asText(cloud.bucket),
    region: asText(cloud.region, 'auto') || 'auto',
    accessKeyId: asText(cloud.accessKeyId),
    secretAccessKey: typeof cloud.secretAccessKey === 'string' ? cloud.secretAccessKey : '',
  };
}

function normalizeCamera(input: unknown): EquipmentCamera | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const camera = input as Partial<EquipmentCamera>;
  if (typeof camera.id !== 'string' || !camera.id.trim()) {
    return undefined;
  }
  return {
    id: camera.id.trim(),
    name: asText(camera.name, camera.id),
    deviceId: asText(camera.deviceId),
    isActive: camera.isActive !== false,
  };
}

function normalizeButton(input: unknown): EquipmentButton | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const button = input as Partial<EquipmentButton>;
  if (typeof button.id !== 'string' || !button.id.trim()) {
    return undefined;
  }
  const type = button.type === 'gpio' ? 'gpio' : 'virtual';
  return {
    id: button.id.trim(),
    name: asText(button.name, button.id),
    type,
    isActive: button.isActive !== false,
    gpioPin: typeof button.gpioPin === 'number' ? button.gpioPin : undefined,
    gpioChip: asText(button.gpioChip) || undefined,
    activeLow: typeof button.activeLow === 'boolean' ? button.activeLow : undefined,
  };
}

function normalizeBinding(input: unknown): EquipmentBinding | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const binding = input as Partial<EquipmentBinding>;
  if (typeof binding.buttonId !== 'string' || !binding.buttonId.trim()) {
    return undefined;
  }
  return {
    buttonId: binding.buttonId.trim(),
    cameraIds: Array.isArray(binding.cameraIds)
      ? binding.cameraIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [],
  };
}

function normalizeCourt(input: unknown, fallbackId: string): Court | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const court = input as Partial<Court>;
  const id = asText(court.id, fallbackId);
  if (!id) {
    return undefined;
  }
  return {
    id,
    name: asText(court.name, 'Quadra'),
    cloud: normalizeCloud(court.cloud),
    cameras: Array.isArray(court.cameras) ? court.cameras.map(normalizeCamera).filter((camera): camera is EquipmentCamera => Boolean(camera)) : [],
    buttons: Array.isArray(court.buttons) ? court.buttons.map(normalizeButton).filter((button): button is EquipmentButton => Boolean(button)) : [],
    bindings: Array.isArray(court.bindings)
      ? court.bindings.map(normalizeBinding).filter((binding): binding is EquipmentBinding => Boolean(binding))
      : [],
  };
}

function legacyCourt(input: { cameras?: unknown; buttons?: unknown; bindings?: unknown }): Court {
  const court = normalizeCourt(
    {
      id: DEFAULT_COURT_ID,
      name: 'Quadra principal',
      cloud: EMPTY_COURT_CLOUD,
      cameras: input.cameras,
      buttons: input.buttons,
      bindings: input.bindings,
    },
    DEFAULT_COURT_ID,
  );
  return court ?? { id: DEFAULT_COURT_ID, name: 'Quadra principal', cloud: { ...EMPTY_COURT_CLOUD }, cameras: [], buttons: [], bindings: [] };
}

export function createCourt(id: string, name: string): Court {
  return {
    id,
    name: name.trim() || 'Nova quadra',
    cloud: { ...EMPTY_COURT_CLOUD },
    cameras: [],
    buttons: [],
    bindings: [],
  };
}

export function normalizeEquipmentConfig(input: unknown): EquipmentConfig {
  if (!input || typeof input !== 'object') {
    const court = createCourt(DEFAULT_COURT_ID, 'Quadra principal');
    return { activeCourtId: court.id, courts: [court] };
  }
  const candidate = input as Partial<EquipmentConfig> & { cameras?: unknown; buttons?: unknown; bindings?: unknown };
  const courts = Array.isArray(candidate.courts)
    ? candidate.courts
        .map((court, index) => normalizeCourt(court, `quadra-${index + 1}`))
        .filter((court): court is Court => Boolean(court))
    : [];
  const ready = courts.length > 0 ? courts : [legacyCourt(candidate)];
  const requested = asText(candidate.activeCourtId);
  const activeCourtId = ready.some((court) => court.id === requested) ? requested : ready[0].id;
  return { activeCourtId, courts: ready };
}
