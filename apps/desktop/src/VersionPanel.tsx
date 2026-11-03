import { useEffect, useRef, useState } from 'react';
import type { VersionStatus } from '../electron/ipc-types';

const WATCH_LIMIT_MS = 12 * 60 * 1000;
const WATCH_INTERVAL_MS = 3000;

function commitLine(label: string, hash?: string, subject?: string): string {
  if (!hash) {
    return label;
  }
  return `${label}: ${hash}${subject ? ` — ${subject}` : ''}`;
}

export function VersionPanel() {
  const [status, setStatus] = useState<VersionStatus | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const stopWatch = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    async function look(): Promise<void> {
      try {
        const next = await window.desktopApi.getVersionStatus();
        if (stop) {
          return;
        }
        setStatus(next);
        setOffline(false);
        if (next.updating) {
          setBusy(true);
          watchUntilDone();
        }
      } catch (error) {
        if (stop) {
          return;
        }
        setMessage(error instanceof Error ? error.message : 'Não foi possível consultar a main.');
      } finally {
        if (!stop) {
          setLoading(false);
        }
      }
    }
    void look();
    return () => {
      stop = true;
      stopWatch.current?.();
    };
  }, []);

  function watchUntilDone(): void {
    stopWatch.current?.();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sawRunning = false;
    let stopped = false;

    const finish = (text: string | undefined) => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      setBusy(false);
      setMessage(text);
    };

    const tick = async (): Promise<void> => {
      if (stopped) {
        return;
      }
      if (Date.now() - startedAt > WATCH_LIMIT_MS) {
        finish('A atualização passou de doze minutos. Abra a aba de novo para consultar.');
        return;
      }
      try {
        const next = await window.desktopApi.getVersionStatus();
        if (stopped) {
          return;
        }
        setStatus(next);
        setOffline(false);
        if (next.updating) {
          sawRunning = true;
          timer = setTimeout(() => void tick(), WATCH_INTERVAL_MS);
          return;
        }
        if (sawRunning || (next.current?.hash && next.current.hash === next.remote?.hash)) {
          finish(next.message);
          return;
        }
        timer = setTimeout(() => void tick(), WATCH_INTERVAL_MS);
      } catch {
        if (stopped) {
          return;
        }
        setOffline(true);
        timer = setTimeout(() => void tick(), WATCH_INTERVAL_MS);
      }
    };

    stopWatch.current = () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
    timer = setTimeout(() => void tick(), WATCH_INTERVAL_MS);
  }

  async function update(): Promise<void> {
    setBusy(true);
    setMessage(undefined);
    setOffline(false);
    try {
      const result = await window.desktopApi.startUpdate();
      setMessage(result.message);
      if (!result.ok) {
        setBusy(false);
        return;
      }
      watchUntilDone();
    } catch (error) {
      setBusy(false);
      setOffline(true);
      setMessage(error instanceof Error ? error.message : 'Não foi possível começar a atualização.');
      watchUntilDone();
    }
  }

  const buttonEnabled = Boolean(status?.updateAvailable) && !busy && !status?.updating;

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-8">
        <div className="card">
          <div className="card-header">
            <strong>Controle de versão</strong>
          </div>
          <div className="card-body">
            {loading ? <p className="text-secondary">Consultando a main...</p> : null}
            {offline ? (
              <div className="alert alert-warning">A página perdeu a conexão. Tentando de novo...</div>
            ) : null}
            {message ? <div className="alert alert-info">{message}</div> : null}
            {status && !status.available ? <p>{status.message}</p> : null}
            {status?.available ? (
              <>
                {status.message && !message ? <p>{status.message}</p> : null}
                <p className="mb-1">{commitLine('Este aparelho', status.current?.hash, status.current?.subject)}</p>
                <p className="mb-3">{commitLine('Main', status.remote?.hash, status.remote?.subject)}</p>
                <button className="btn btn-primary" type="button" disabled={!buttonEnabled} onClick={() => void update()}>
                  {busy || status.updating ? 'Atualizando...' : 'Atualizar'}
                </button>
                <p className="small text-secondary mt-3 mb-0">
                  A compilação acontece com a câmera ligada. Na troca final a captura para por alguns segundos.
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
