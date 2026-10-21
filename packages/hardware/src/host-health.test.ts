import {
  assessHostHealth,
  cpuUsagePercent,
  describePower,
  parseThermalCelsius,
  parseThrottled,
  type HostSample,
} from './host-health';

function sample(overrides: Partial<HostSample> = {}): HostSample {
  return {
    capturedAt: new Date('2026-10-21T18:00:00.000Z'),
    cores: 4,
    cpuUsagePercent: 20,
    loadAverage1m: 1.2,
    memoryUsedBytes: 400,
    memoryTotalBytes: 1000,
    diskUsedBytes: 200,
    diskTotalBytes: 1000,
    diskFreeBytes: 800,
    temperatureCelsius: 48,
    throttledBits: 0,
    uptimeSeconds: 3600,
    ...overrides,
  };
}

describe('cpuUsagePercent', () => {
  it('measures the busy share between two samples', () => {
    expect(cpuUsagePercent({ idle: 0, total: 0 }, { idle: 50, total: 100 })).toBe(50);
  });
});

describe('parseThermalCelsius', () => {
  it('converts millidegrees from the thermal zone', () => {
    expect(parseThermalCelsius('62341\n')).toBe(62.3);
  });
});

describe('parseThrottled', () => {
  it('reads the vcgencmd hex value', () => {
    expect(parseThrottled('throttled=0x50005\n')).toBe(0x50005);
  });
});

describe('assessHostHealth', () => {
  it('reports a comfortable machine', () => {
    const report = assessHostHealth(sample());
    expect(report.level).toBe('ok');
    expect(report.summary).toBe('Nenhum gargalo aparente.');
    expect(report.temperature?.celsius).toBe(48);
    expect(report.power?.level).toBe('ok');
  });

  it('flags cpu, load, memory, disk and temperature together', () => {
    const report = assessHostHealth(
      sample({
        cpuUsagePercent: 96,
        loadAverage1m: 7,
        memoryUsedBytes: 950,
        diskUsedBytes: 930,
        diskFreeBytes: 70,
        temperatureCelsius: 81,
      }),
    );

    expect(report.level).toBe('critical');
    expect(report.cpu.level).toBe('critical');
    expect(report.load?.level).toBe('critical');
    expect(report.memory.level).toBe('critical');
    expect(report.disk.level).toBe('critical');
    expect(report.temperature?.level).toBe('critical');
    expect(report.summary).toContain('CPU em 96%');
    expect(report.summary).toContain('disco em 93%');
  });

  it('treats load above the core count as attention before it becomes critical', () => {
    const report = assessHostHealth(sample({ loadAverage1m: 4.5 }));
    expect(report.load?.level).toBe('attention');
    expect(report.level).toBe('attention');
  });

  it('does not invent a cpu percentage before the second sample', () => {
    const report = assessHostHealth(sample({ cpuUsagePercent: undefined }));
    expect(report.cpu.level).toBe('unknown');
    expect(report.level).toBe('ok');
  });

  it('warns when the power supply is weak', () => {
    expect(describePower(0x1).level).toBe('critical');
    expect(describePower(0x50000).level).toBe('attention');
    const report = assessHostHealth(sample({ throttledBits: 0x1 }));
    expect(report.power?.message).toContain('fonte');
    expect(report.level).toBe('critical');
  });

  it('leaves temperature out when the board does not publish it', () => {
    const report = assessHostHealth(sample({ temperatureCelsius: undefined, throttledBits: undefined, loadAverage1m: undefined }));
    expect(report.temperature).toBeUndefined();
    expect(report.power).toBeUndefined();
    expect(report.load).toBeUndefined();
    expect(report.level).toBe('ok');
  });
});
