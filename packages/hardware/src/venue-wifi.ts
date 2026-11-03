import { execFile } from 'node:child_process';
import { hostname } from 'node:os';

export const WIFI_HELPER_PATH = '/usr/local/sbin/olho-rede';

export const DIRECT_NETWORK_UNAVAILABLE = 'A rede direta do aparelho só existe no Raspberry Pi.';

export interface WifiCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type WifiCommandRunner = (args: string[], stdin?: string) => Promise<WifiCommandResult>;

export interface AccessPointStatus {
  ssid: string;
  address: string;
  active: boolean;
  password?: string;
}

export interface VenueLinkStatus {
  connected: boolean;
  ssid?: string;
  signal?: number;
}

export interface NetworkStatus {
  available: boolean;
  message?: string;
  hostname?: string;
  accessPoint?: AccessPointStatus;
  venue?: VenueLinkStatus;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  inUse: boolean;
}

export interface WifiScan {
  available: boolean;
  message?: string;
  networks: WifiNetwork[];
}

export interface WifiConnectResult {
  ok: boolean;
  message: string;
}

export function createSudoWifiRunner(helperPath = WIFI_HELPER_PATH): WifiCommandRunner {
  return (args, stdin) =>
    new Promise((resolve) => {
      const child = execFile(
        'sudo',
        ['-n', helperPath, ...args],
        { timeout: 55_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
            return;
          }
          const errno = error as NodeJS.ErrnoException;
          const code = typeof errno.code === 'number' ? errno.code : 1;
          const extra = typeof errno.code === 'string' ? error.message : '';
          resolve({
            code,
            stdout: stdout ?? '',
            stderr: `${stderr ?? ''}${extra}`,
          });
        },
      );
      child.stdin?.end(stdin ?? '');
    });
}

export function accessPointMac(wlanMac: string): string {
  const parts = wlanMac.trim().toLowerCase().split(':');
  if (parts.length !== 6 || parts.some((part) => !/^[0-9a-f]{2}$/.test(part))) {
    throw new Error(`Invalid MAC address: ${wlanMac}`);
  }
  const first = Number.parseInt(parts[0], 16);
  parts[0] = ((first | 0x02) & 0xfe).toString(16).padStart(2, '0');
  if (parts.join(':') === wlanMac.trim().toLowerCase()) {
    parts[5] = (Number.parseInt(parts[5], 16) ^ 0x01).toString(16).padStart(2, '0');
  }
  return parts.join(':');
}

export function accessPointSsid(wlanMac: string, prefix = 'Olho no lance'): string {
  const hex = wlanMac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length < 4) {
    throw new Error(`Invalid MAC address: ${wlanMac}`);
  }
  return `${prefix} ${hex.slice(-4)}`;
}

export function validateVenueWifiInput(ssid: string, password: string): string | undefined {
  if (ssid.trim().length === 0 || ssid.length > 32 || [...ssid].some((char) => char.charCodeAt(0) < 32)) {
    return 'Informe o nome da rede da quadra.';
  }
  if (password.length > 0 && (password.length < 8 || password.length > 63)) {
    return 'A senha da quadra precisa ter entre 8 e 63 caracteres. Rede aberta deixa a senha em branco.';
  }
  return undefined;
}

export function redactSecret(text: string, secret: string): string {
  if (!secret) {
    return text;
  }
  return text.split(secret).join('***');
}

export function explainWifiHelperFailure(detail: string): string {
  const text = detail.toLowerCase();
  if (
    text.includes('password is required') ||
    text.includes('not permitted') ||
    text.includes('not allowed') ||
    text.includes('a terminal is required')
  ) {
    return 'O serviço não tem permissão para configurar a rede. Rode o setup do Raspberry de novo.';
  }
  if (text.includes('not found') || text.includes('no such file') || text.includes('enoent')) {
    return 'A rede direta ainda não foi instalada neste Raspberry. Rode o setup de novo.';
  }
  return 'Não foi possível consultar a rede do aparelho.';
}

export function omitOwnAccessPoint(networks: WifiNetwork[], ownSsid: string | undefined): WifiNetwork[] {
  if (!ownSsid) {
    return networks;
  }
  return networks.filter((network) => network.ssid !== ownSsid);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseNetworkStatus(stdout: string): NetworkStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { available: false, message: 'Não foi possível consultar a rede do aparelho.' };
  }
  const record = asRecord(parsed);
  if (!record || record.available !== true) {
    const message =
      record && typeof record.message === 'string' ? record.message : 'Não foi possível consultar a rede do aparelho.';
    return { available: false, message };
  }
  return {
    available: true,
    message: typeof record.message === 'string' ? record.message : undefined,
    accessPoint: parseAccessPoint(record.accessPoint),
    venue: parseVenue(record.venue),
  };
}

function parseAccessPoint(value: unknown): AccessPointStatus | undefined {
  const record = asRecord(value);
  if (!record || typeof record.ssid !== 'string' || record.ssid.length === 0) {
    return undefined;
  }
  const password = typeof record.password === 'string' && record.password.length > 0 ? record.password : undefined;
  return {
    ssid: record.ssid,
    address: typeof record.address === 'string' && record.address.length > 0 ? record.address : '192.168.4.1',
    active: record.active === true,
    password,
  };
}

function parseVenue(value: unknown): VenueLinkStatus | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  return {
    connected: record.connected === true,
    ssid: typeof record.ssid === 'string' && record.ssid.length > 0 ? record.ssid : undefined,
    signal: typeof record.signal === 'number' && Number.isFinite(record.signal) ? record.signal : undefined,
  };
}

export function normalizeWifiNetworks(rawNetworks: unknown[]): WifiNetwork[] {
  const bySsid = new Map<string, WifiNetwork>();
  for (const raw of rawNetworks) {
    const record = asRecord(raw);
    if (!record || typeof record.ssid !== 'string' || record.ssid.trim().length === 0) {
      continue;
    }
    const network: WifiNetwork = {
      ssid: record.ssid,
      signal: typeof record.signal === 'number' && Number.isFinite(record.signal) ? Math.round(record.signal) : 0,
      security: typeof record.security === 'string' ? record.security : '',
      inUse: record.inUse === true,
    };
    const current = bySsid.get(network.ssid);
    if (!current || network.signal > current.signal) {
      bySsid.set(network.ssid, network);
    }
  }
  return [...bySsid.values()].sort((left, right) => right.signal - left.signal || left.ssid.localeCompare(right.ssid));
}

export function parseWifiScan(stdout: string): WifiScan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { available: false, networks: [], message: 'Não foi possível procurar redes.' };
  }
  const record = asRecord(parsed);
  if (!record || record.available !== true) {
    const message = record && typeof record.message === 'string' ? record.message : 'Não foi possível procurar redes.';
    return { available: false, networks: [], message };
  }
  return {
    available: true,
    message: typeof record.message === 'string' ? record.message : undefined,
    networks: normalizeWifiNetworks(Array.isArray(record.networks) ? record.networks : []),
  };
}

function parseConnectResult(stdout: string, password: string): WifiConnectResult | undefined {
  try {
    const record = asRecord(JSON.parse(stdout));
    if (!record || typeof record.ok !== 'boolean' || typeof record.message !== 'string') {
      return undefined;
    }
    return { ok: record.ok, message: redactSecret(record.message, password) };
  } catch {
    return undefined;
  }
}

export class VenueWifi {
  constructor(
    private readonly runner: WifiCommandRunner,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async status(): Promise<NetworkStatus> {
    if (this.platform !== 'linux') {
      return { available: false, message: DIRECT_NETWORK_UNAVAILABLE };
    }
    try {
      const result = await this.runner(['status']);
      if (result.code !== 0) {
        return { available: false, message: explainWifiHelperFailure(`${result.stderr}\n${result.stdout}`) };
      }
      const parsed = parseNetworkStatus(result.stdout);
      if (parsed.available) {
        parsed.hostname = hostname();
      }
      return parsed;
    } catch (error) {
      return {
        available: false,
        message: explainWifiHelperFailure(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async scan(): Promise<WifiScan> {
    if (this.platform !== 'linux') {
      return { available: false, networks: [], message: DIRECT_NETWORK_UNAVAILABLE };
    }
    try {
      const result = await this.runner(['scan']);
      if (result.code !== 0) {
        return {
          available: false,
          networks: [],
          message: explainWifiHelperFailure(`${result.stderr}\n${result.stdout}`),
        };
      }
      const parsed = parseWifiScan(result.stdout);
      if (!parsed.available) {
        return parsed;
      }
      const current = await this.status();
      return { ...parsed, networks: omitOwnAccessPoint(parsed.networks, current.accessPoint?.ssid) };
    } catch (error) {
      return {
        available: false,
        networks: [],
        message: explainWifiHelperFailure(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async connect(ssid: string, password: string): Promise<WifiConnectResult> {
    const invalid = validateVenueWifiInput(ssid, password);
    if (invalid) {
      return { ok: false, message: invalid };
    }
    if (this.platform !== 'linux') {
      return { ok: false, message: DIRECT_NETWORK_UNAVAILABLE };
    }
    try {
      const result = await this.runner(['connect'], JSON.stringify({ ssid, password }));
      const parsed = parseConnectResult(result.stdout, password);
      if (parsed) {
        return parsed;
      }
      const detail = redactSecret(`${result.stderr}\n${result.stdout}`, password).trim();
      return { ok: false, message: detail.length > 0 ? detail : 'Não foi possível entrar na rede da quadra.' };
    } catch (error) {
      return {
        ok: false,
        message: redactSecret(error instanceof Error ? error.message : String(error), password),
      };
    }
  }
}
