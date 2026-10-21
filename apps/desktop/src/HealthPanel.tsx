import type { HealthLevel, HostHealthReport } from '../electron/ipc-types';

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) {
    return `${days} d ${hours} h`;
  }
  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }
  return `${minutes} min`;
}

function levelLabel(level: HealthLevel): string {
  if (level === 'critical') {
    return 'Crítico';
  }
  if (level === 'attention') {
    return 'Atenção';
  }
  if (level === 'unknown') {
    return 'Sem leitura';
  }
  return 'Normal';
}

function alertClass(level: HealthLevel): string {
  if (level === 'critical') {
    return 'alert-danger';
  }
  if (level === 'attention') {
    return 'alert-warning';
  }
  if (level === 'unknown') {
    return 'alert-secondary';
  }
  return 'alert-success';
}

function badgeClass(level: HealthLevel): string {
  if (level === 'critical') {
    return 'text-bg-danger';
  }
  if (level === 'attention') {
    return 'text-bg-warning';
  }
  if (level === 'unknown') {
    return 'text-bg-secondary';
  }
  return 'text-bg-success';
}

function barClass(level: HealthLevel): string {
  if (level === 'critical') {
    return 'bg-danger';
  }
  if (level === 'attention') {
    return 'bg-warning';
  }
  if (level === 'unknown') {
    return 'bg-secondary';
  }
  return 'bg-success';
}

function MetricCard(props: {
  title: string;
  value: string;
  detail?: string;
  percent?: number;
  level: HealthLevel;
}) {
  return (
    <div className="col-12 col-md-6">
      <div className="card h-100">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center gap-2">
            <strong>{props.title}</strong>
            <span className={`badge ${badgeClass(props.level)}`}>{levelLabel(props.level)}</span>
          </div>
          <div className="fs-4 mt-2">{props.value}</div>
          {props.detail ? <div className="small text-secondary">{props.detail}</div> : null}
          {props.percent !== undefined ? (
            <div
              className="progress mt-3"
              role="progressbar"
              aria-valuenow={Math.round(props.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={props.title}
            >
              <div className={`progress-bar ${barClass(props.level)}`} style={{ width: `${Math.min(100, Math.max(0, props.percent))}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HealthPanel({ report, error }: { report?: HostHealthReport; error?: string }) {
  if (error) {
    return <div className="alert alert-danger mb-0">{error}</div>;
  }
  if (!report) {
    return <div className="text-secondary">Lendo o equipamento...</div>;
  }

  const loadPercent =
    report.load === undefined ? undefined : Math.min(100, (report.load.average1m / (report.cpu.cores * 1.5)) * 100);
  const temperaturePercent =
    report.temperature === undefined ? undefined : Math.min(100, (report.temperature.celsius / 85) * 100);

  return (
    <div className="row g-3">
      <div className="col-12">
        <div className={`alert ${alertClass(report.level)} mb-0`}>
          <div>{report.summary}</div>
          <div className="small mt-1">
            Atualizado às {new Date(report.capturedAt).toLocaleTimeString('pt-BR')} · ligado há {formatUptime(report.uptimeSeconds)}
          </div>
        </div>
      </div>
      <MetricCard
        title="CPU"
        value={report.cpu.usagePercent === undefined ? 'Medindo...' : `${report.cpu.usagePercent}%`}
        detail={`${report.cpu.cores} núcleos`}
        percent={report.cpu.usagePercent}
        level={report.cpu.level}
      />
      <MetricCard
        title="Carga"
        value={report.load ? report.load.average1m.toLocaleString('pt-BR') : 'Não disponível'}
        detail={report.load ? `Média de 1 minuto, para ${report.cpu.cores} núcleos` : 'Este sistema não informa a carga.'}
        percent={loadPercent}
        level={report.load?.level ?? 'unknown'}
      />
      <MetricCard
        title="Memória"
        value={`${report.memory.usedPercent}%`}
        detail={`${formatBytes(report.memory.usedBytes)} de ${formatBytes(report.memory.totalBytes)}`}
        percent={report.memory.usedPercent}
        level={report.memory.level}
      />
      <MetricCard
        title="Disco"
        value={report.disk.usedPercent === undefined ? 'Não disponível' : `${report.disk.usedPercent}%`}
        detail={
          report.disk.freeBytes === undefined
            ? 'Não foi possível ler o disco das gravações.'
            : `${formatBytes(report.disk.freeBytes)} livres de ${formatBytes(report.disk.totalBytes)}`
        }
        percent={report.disk.usedPercent}
        level={report.disk.level}
      />
      <MetricCard
        title="Temperatura"
        value={report.temperature ? `${report.temperature.celsius.toLocaleString('pt-BR')} °C` : 'Não disponível'}
        detail={report.temperature ? 'Sensor do equipamento' : 'Este sistema não informa a temperatura.'}
        percent={temperaturePercent}
        level={report.temperature?.level ?? 'unknown'}
      />
      <MetricCard
        title="Alimentação"
        value={report.power ? levelLabel(report.power.level) : 'Não disponível'}
        detail={report.power?.message ?? 'Este sistema não informa limite de fonte ou temperatura.'}
        level={report.power?.level ?? 'unknown'}
      />
    </div>
  );
}
