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

export interface StorageBucket extends CourtCloud {
  id: string;
  name: string;
}

export interface Court {
  id: string;
  name: string;
  cameraIds: string[];
  buttonIds: string[];
  bucketId: string;
}

export interface EquipmentConfig {
  activeCourtId: string;
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  buckets: StorageBucket[];
  courts: Court[];
}

export interface CourtCatalog {
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: EquipmentBinding[];
}

export interface CourtUploadTarget {
  id: string;
  cloud: CourtCloud;
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
  const cameras = config.cameras.filter((camera) => court.cameraIds.includes(camera.id));
  const buttons = config.buttons.filter((button) => court.buttonIds.includes(button.id));
  const cameraIds = cameras.map((camera) => camera.id);
  return {
    cameras,
    buttons,
    bindings: buttons.map((button) => ({ buttonId: button.id, cameraIds })),
  };
}

export function courtUploadTargets(config: EquipmentConfig): CourtUploadTarget[] {
  return config.courts.map((court) => {
    const bucket = config.buckets.find((item) => item.id === court.bucketId);
    return {
      id: court.id,
      cloud: bucket ? cloudOf(bucket) : { ...EMPTY_COURT_CLOUD },
    };
  });
}

export function mapActiveCourt(config: EquipmentConfig, updater: (court: Court) => Court): EquipmentConfig {
  const selectedId = activeCourt(config).id;
  return {
    ...config,
    activeCourtId: selectedId,
    courts: config.courts.map((court) => (court.id === selectedId ? updater(court) : court)),
  };
}

export function createCourt(id: string, name: string, bucketId = ''): Court {
  return {
    id,
    name: name.trim() || 'Nova quadra',
    cameraIds: [],
    buttonIds: [],
    bucketId,
  };
}

export function isCatalogEquipmentConfig(input: unknown): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const value = input as { buckets?: unknown; courts?: unknown };
  if (!Array.isArray(value.buckets) || !Array.isArray(value.courts) || value.courts.length === 0) {
    return false;
  }
  return value.courts.every((court) => {
    if (!court || typeof court !== 'object') {
      return false;
    }
    return Array.isArray((court as { cameraIds?: unknown }).cameraIds);
  });
}

export function normalizeEquipmentConfig(input: unknown): EquipmentConfig {
  if (isCatalogEquipmentConfig(input)) {
    return normalizeCatalog(input as Record<string, unknown>);
  }
  return migrateNested(input);
}

function cloudOf(bucket: StorageBucket): CourtCloud {
  return {
    endpoint: bucket.endpoint,
    bucket: bucket.bucket,
    region: bucket.region,
    accessKeyId: bucket.accessKeyId,
    secretAccessKey: bucket.secretAccessKey,
  };
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function uniqueIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      continue;
    }
    const id = item.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
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

function normalizeBucket(input: unknown, fallbackId: string): StorageBucket | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const bucket = input as Partial<StorageBucket>;
  const id = asText(bucket.id, fallbackId);
  if (!id) {
    return undefined;
  }
  return {
    id,
    name: asText(bucket.name, 'Bucket'),
    ...normalizeCloud(bucket),
  };
}

function pushUnique<T extends { id: string }>(items: T[], next: T | undefined): void {
  if (!next || items.some((item) => item.id === next.id)) {
    return;
  }
  items.push(next);
}

function normalizeCatalog(input: Record<string, unknown>): EquipmentConfig {
  const cameras = Array.isArray(input.cameras)
    ? input.cameras.map(normalizeCamera).filter((camera): camera is EquipmentCamera => Boolean(camera))
    : [];
  const buttons = Array.isArray(input.buttons)
    ? input.buttons.map(normalizeButton).filter((button): button is EquipmentButton => Boolean(button))
    : [];
  const buckets = Array.isArray(input.buckets)
    ? input.buckets
        .map((bucket, index) => normalizeBucket(bucket, `bucket-${index + 1}`))
        .filter((bucket): bucket is StorageBucket => Boolean(bucket))
    : [];
  const cameraIds = new Set(cameras.map((camera) => camera.id));
  const buttonIds = new Set(buttons.map((button) => button.id));
  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const courts = (Array.isArray(input.courts) ? input.courts : [])
    .map((court, index) => normalizeCourt(court, `quadra-${index + 1}`, cameraIds, buttonIds, bucketIds))
    .filter((court): court is Court => Boolean(court));
  const readyCourts = courts.length > 0 ? courts : [createCourt(DEFAULT_COURT_ID, 'Quadra principal', buckets[0]?.id ?? '')];
  const requested = asText(input.activeCourtId);
  return {
    activeCourtId: readyCourts.some((court) => court.id === requested) ? requested : readyCourts[0].id,
    cameras,
    buttons,
    buckets,
    courts: readyCourts,
  };
}

function normalizeCourt(
  input: unknown,
  fallbackId: string,
  cameraIds: Set<string>,
  buttonIds: Set<string>,
  bucketIds: Set<string>,
): Court | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const court = input as Partial<Court>;
  const id = asText(court.id, fallbackId);
  if (!id) {
    return undefined;
  }
  const bucketId = asText(court.bucketId);
  return {
    id,
    name: asText(court.name, 'Quadra'),
    cameraIds: uniqueIds(court.cameraIds).filter((cameraId) => cameraIds.has(cameraId)),
    buttonIds: uniqueIds(court.buttonIds).filter((buttonId) => buttonIds.has(buttonId)),
    bucketId: bucketIds.has(bucketId) ? bucketId : '',
  };
}

function migrateNested(input: unknown): EquipmentConfig {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const nested = Array.isArray(source.courts)
    ? source.courts
    : [
        {
          id: DEFAULT_COURT_ID,
          name: 'Quadra principal',
          cloud: EMPTY_COURT_CLOUD,
          cameras: source.cameras,
          buttons: source.buttons,
        },
      ];
  const cameras: EquipmentCamera[] = [];
  const buttons: EquipmentButton[] = [];
  const buckets: StorageBucket[] = [];
  const courts: Court[] = [];
  nested.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const court = raw as Record<string, unknown>;
    const id = asText(court.id, `quadra-${index + 1}`);
    const name = asText(court.name, 'Quadra');
    const courtCameras = Array.isArray(court.cameras)
      ? court.cameras.map(normalizeCamera).filter((camera): camera is EquipmentCamera => Boolean(camera))
      : [];
    const courtButtons = Array.isArray(court.buttons)
      ? court.buttons.map(normalizeButton).filter((button): button is EquipmentButton => Boolean(button))
      : [];
    courtCameras.forEach((camera) => pushUnique(cameras, camera));
    courtButtons.forEach((button) => pushUnique(buttons, button));
    const bucket = normalizeBucket(
      { id: `bucket-${id}`, name: `Bucket ${name}`, ...(normalizeCloud(court.cloud)) },
      `bucket-${id}`,
    );
    if (bucket) {
      pushUnique(buckets, bucket);
    }
    courts.push({
      id,
      name,
      cameraIds: courtCameras.map((camera) => camera.id),
      buttonIds: courtButtons.map((button) => button.id),
      bucketId: bucket?.id ?? '',
    });
  });
  const readyCourts = courts.length > 0 ? courts : [createCourt(DEFAULT_COURT_ID, 'Quadra principal')];
  const requested = asText(source.activeCourtId);
  return {
    activeCourtId: readyCourts.some((court) => court.id === requested) ? requested : readyCourts[0].id,
    cameras,
    buttons,
    buckets,
    courts: readyCourts,
  };
}
