import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type HealthLevel = 'ok' | 'attention' | 'critical' | 'unknown';

export interface CpuTimes {
  idle: number;
  total: number;
}

export interface HostSample {
  capturedAt: Date;
  cores: number;
  cpuUsagePercent?: number;
  loadAverage1m?: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  diskFreeBytes?: number;
  temperatureCelsius?: number;
  throttledBits?: number;
  uptimeSeconds: number;
}

export interface HostHealthReport {
  level: HealthLevel;
  summary: string;
  capturedAt: string;
  uptimeSeconds: number;
  cpu: {
    usagePercent?: number;
    cores: number;
    level: HealthLevel;
  };
  load?: {
    average1m: number;
    level: HealthLevel;
  };
  memory: {
    usedBytes: number;
    totalBytes: number;
    usedPercent: number;
    level: HealthLevel;
  };
  disk: {
    usedBytes?: number;
    totalBytes?: number;
    freeBytes?: number;
    usedPercent?: number;
    level: HealthLevel;
  };
  temperature?: {
    celsius: number;
    level: HealthLevel;
  };
  power?: {
    bits: number;
    level: HealthLevel;
    message: string;
  };
}

const CPU_ATTENTION = 85;
const CPU_CRITICAL = 95;
const MEMORY_ATTENTION = 80;
const MEMORY_CRITICAL = 92;
const DISK_ATTENTION = 80;
const DISK_CRITICAL = 92;
const TEMPERATURE_ATTENTION = 70;
const TEMPERATURE_CRITICAL = 80;

export function sumCpuTimes(
  cpus: Array<{ times: { user: number; nice: number; sys: number; idle: number; irq: number } }>,
): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

export function cpuUsagePercent(previous: CpuTimes, next: CpuTimes): number | undefined {
  const idle = next.idle - previous.idle;
  const total = next.total - previous.total;
  if (total <= 0) {
    return undefined;
  }
  const usage = (1 - idle / total) * 100;
  return round1(Math.min(100, Math.max(0, usage)));
}

export function parseThermalCelsius(text: string): number | undefined {
  const value = Number.parseInt(text.trim(), 10);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return round1(value > 1000 ? value / 1000 : value);
}

export function parseThrottled(text: string): number | undefined {
  const match = text.match(/0x[0-9a-fA-F]+|\d+/);
  if (!match) {
    return undefined;
  }
  const value = match[0].startsWith('0x') ? Number.parseInt(match[0], 16) : Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : undefined;
}

export function describePower(bits: number): { level: HealthLevel; message: string } {
  const underVoltageNow = (bits & 0x1) !== 0;
  const frequencyCappedNow = (bits & 0x2) !== 0;
  const throttledNow = (bits & 0x4) !== 0;
  const softTemperatureNow = (bits & 0x8) !== 0;
  const underVoltageSinceBoot = (bits & 0x10000) !== 0;
  const frequencyCappedSinceBoot = (bits & 0x20000) !== 0;
  const throttledSinceBoot = (bits & 0x40000) !== 0;
  const softTemperatureSinceBoot = (bits & 0x80000) !== 0;

  if (underVoltageNow) {
    return { level: 'critical', message: 'A fonte está fraca agora. A gravação pode falhar.' };
  }
  if (throttledNow || softTemperatureNow || frequencyCappedNow) {
    return { level: 'critical', message: 'O processador reduziu a velocidade agora por temperatura.' };
  }
  if (underVoltageSinceBoot) {
    return { level: 'attention', message: 'A fonte ficou fraca desde a última ligação.' };
  }
  if (throttledSinceBoot || softTemperatureSinceBoot || frequencyCappedSinceBoot) {
    return { level: 'attention', message: 'A temperatura já limitou o processador desde a última ligação.' };
  }
  return { level: 'ok', message: 'Alimentação e temperatura estáveis.' };
}

export function assessHostHealth(sample: HostSample): HostHealthReport {
  const memoryPercent = percent(sample.memoryUsedBytes, sample.memoryTotalBytes);
  const diskPercent =
    sample.diskUsedBytes !== undefined && sample.diskTotalBytes
      ? percent(sample.diskUsedBytes, sample.diskTotalBytes)
      : undefined;
  const cpuLevel =
    sample.cpuUsagePercent === undefined
      ? 'unknown'
      : levelForPercent(sample.cpuUsagePercent, CPU_ATTENTION, CPU_CRITICAL);
  const memoryLevel = levelForPercent(memoryPercent, MEMORY_ATTENTION, MEMORY_CRITICAL);
  const diskLevel =
    diskPercent === undefined ? 'unknown' : levelForPercent(diskPercent, DISK_ATTENTION, DISK_CRITICAL);
  const loadLevel =
    sample.loadAverage1m === undefined
      ? undefined
      : sample.loadAverage1m > sample.cores * 1.5
        ? 'critical'
        : sample.loadAverage1m > sample.cores
          ? 'attention'
          : 'ok';
  const temperatureLevel =
    sample.temperatureCelsius === undefined
      ? undefined
      : sample.temperatureCelsius >= TEMPERATURE_CRITICAL
        ? 'critical'
        : sample.temperatureCelsius >= TEMPERATURE_ATTENTION
          ? 'attention'
          : 'ok';
  const power = sample.throttledBits === undefined ? undefined : { bits: sample.throttledBits, ...describePower(sample.throttledBits) };

  const problems: string[] = [];
  if (cpuLevel === 'attention' || cpuLevel === 'critical') {
    problems.push(`CPU em ${sample.cpuUsagePercent}%`);
  }
  if (loadLevel === 'attention' || loadLevel === 'critical') {
    problems.push(`carga ${round1(sample.loadAverage1m ?? 0)} para ${sample.cores} núcleos`);
  }
  if (memoryLevel === 'attention' || memoryLevel === 'critical') {
    problems.push(`memória em ${memoryPercent}%`);
  }
  if (diskLevel === 'attention' || diskLevel === 'critical') {
    problems.push(`disco em ${diskPercent}%`);
  }
  if (temperatureLevel === 'attention' || temperatureLevel === 'critical') {
    problems.push(`temperatura em ${sample.temperatureCelsius} °C`);
  }
  if (power && power.level !== 'ok') {
    problems.push(power.message);
  }

  const level = worstLevel([
    cpuLevel,
    memoryLevel,
    diskLevel,
    loadLevel,
    temperatureLevel,
    power?.level,
  ]);

  return {
    level,
    summary: problems.length > 0 ? `Gargalo: ${problems.join('; ')}.` : 'Nenhum gargalo aparente.',
    capturedAt: sample.capturedAt.toISOString(),
    uptimeSeconds: sample.uptimeSeconds,
    cpu: {
      usagePercent: sample.cpuUsagePercent,
      cores: sample.cores,
      level: cpuLevel,
    },
    load:
      sample.loadAverage1m === undefined || loadLevel === undefined
        ? undefined
        : { average1m: round1(sample.loadAverage1m), level: loadLevel },
    memory: {
      usedBytes: sample.memoryUsedBytes,
      totalBytes: sample.memoryTotalBytes,
      usedPercent: memoryPercent,
      level: memoryLevel,
    },
    disk: {
      usedBytes: sample.diskUsedBytes,
      totalBytes: sample.diskTotalBytes,
      freeBytes: sample.diskFreeBytes,
      usedPercent: diskPercent,
      level: diskLevel,
    },
    temperature:
      sample.temperatureCelsius === undefined || temperatureLevel === undefined
        ? undefined
        : { celsius: sample.temperatureCelsius, level: temperatureLevel },
    power,
  };
}

/** Reads the machine that is recording and keeps the previous CPU sample. */
export class HostHealthMonitor {
  private previousCpu?: CpuTimes;
  private throttledCommandMissing = false;

  constructor(private readonly diskPath: string) {}

  async read(): Promise<HostHealthReport> {
    const cpus = os.cpus();
    const cpuTimes = sumCpuTimes(cpus);
    const usage = this.previousCpu ? cpuUsagePercent(this.previousCpu, cpuTimes) : undefined;
    this.previousCpu = cpuTimes;

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const load = os.platform() === 'win32' ? undefined : os.loadavg()[0];
    const disk = await readDisk(this.diskPath);
    const temperature = await readTemperature();
    const throttledBits = os.platform() === 'linux' ? await this.readThrottled() : undefined;

    return assessHostHealth({
      capturedAt: new Date(),
      cores: Math.max(1, cpus.length),
      cpuUsagePercent: usage,
      loadAverage1m: load,
      memoryUsedBytes: Math.max(0, totalMemory - freeMemory),
      memoryTotalBytes: totalMemory,
      diskUsedBytes: disk?.usedBytes,
      diskTotalBytes: disk?.totalBytes,
      diskFreeBytes: disk?.freeBytes,
      temperatureCelsius: temperature,
      throttledBits,
      uptimeSeconds: os.uptime(),
    });
  }

  private async readThrottled(): Promise<number | undefined> {
    const files = ['/sys/devices/platform/soc/soc:firmware/get_throttled'];
    for (const filePath of files) {
      try {
        const parsed = parseThrottled(await fs.readFile(filePath, 'utf8'));
        if (parsed !== undefined) {
          return parsed;
        }
      } catch {
        // The next source may exist on this board.
      }
    }

    if (this.throttledCommandMissing) {
      return undefined;
    }

    try {
      const { stdout } = await execFileAsync('vcgencmd', ['get_throttled'], { timeout: 1500 });
      return parseThrottled(stdout);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.throttledCommandMissing = true;
      }
      return undefined;
    }
  }
}

async function readDisk(
  diskPath: string,
): Promise<{ usedBytes: number; totalBytes: number; freeBytes: number } | undefined> {
  try {
    const stats = await statfs(diskPath);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    if (totalBytes <= 0) {
      return undefined;
    }
    return {
      totalBytes,
      freeBytes,
      usedBytes: Math.max(0, totalBytes - freeBytes),
    };
  } catch {
    return undefined;
  }
}

async function readTemperature(): Promise<number | undefined> {
  try {
    return parseThermalCelsius(await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8'));
  } catch {
    return undefined;
  }
}

function percent(used: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return round1(Math.min(100, Math.max(0, (used / total) * 100)));
}

function levelForPercent(value: number, attention: number, critical: number): HealthLevel {
  if (value >= critical) {
    return 'critical';
  }
  if (value >= attention) {
    return 'attention';
  }
  return 'ok';
}

function worstLevel(levels: Array<HealthLevel | undefined>): HealthLevel {
  const rank: Record<HealthLevel, number> = { unknown: 0, ok: 1, attention: 2, critical: 3 };
  let worst: HealthLevel = 'ok';
  for (const level of levels) {
    if (level && rank[level] > rank[worst]) {
      worst = level;
    }
  }
  return worst;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
