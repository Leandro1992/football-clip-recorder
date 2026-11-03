import { useCallback, useEffect, useState } from 'react';
import type { NetworkStatus, WifiNetwork } from '../electron/ipc-types';

function securityLabel(security: string): string {
  if (security.trim().length === 0 || security === '--') {
    return 'Aberta';
  }
  return security;
}

export function NetworkPanel() {
  const [status, setStatus] = useState<NetworkStatus | undefined>(undefined);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (scan = true): Promise<void> => {
    if (scan) {
      setLoading(true);
    }
    setError(undefined);
    try {
      const nextStatus = await window.desktopApi.getNetworkStatus();
      setStatus(nextStatus);
      if (!nextStatus.available || !scan) {
        if (!nextStatus.available) {
          setNetworks([]);
        }
        return;
      }
      const nextScan = await window.desktopApi.scanWifi();
      if (!nextScan.available) {
        setError(nextScan.message);
        setNetworks([]);
        return;
      }
      setNetworks(nextScan.networks);
      setSelectedSsid((current) => current || nextScan.networks.find((network) => network.inUse)?.ssid || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível ler a rede.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(): Promise<void> {
    if (!selectedSsid) {
      setMessage('Escolha a rede da quadra.');
      return;
    }
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const result = await window.desktopApi.connectVenueWifi(selectedSsid, password);
      setMessage(result.message);
      setPassword('');
      await load(false);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Não foi possível entrar na rede da quadra.');
    } finally {
      setBusy(false);
    }
  }

  const pageAddress = status?.accessPoint?.address || '192.168.4.1';

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <div className="card mb-3">
          <div className="card-header">
            <strong>Rede do aparelho</strong>
          </div>
          <div className="card-body">
            {status === undefined ? (
              error ? (
                <div className="alert alert-danger mb-0">{error}</div>
              ) : (
                <p className="text-secondary mb-0">Lendo a rede...</p>
              )
            ) : status.available === false ? (
              <div className="alert alert-secondary mb-0">{status.message}</div>
            ) : (
              <>
                <p className="mb-2">
                  No celular, entre nesta rede Wi-Fi e abra{' '}
                  <a href="http://olhonolance.admin">http://olhonolance.admin</a>. Se o nome não abrir, use{' '}
                  <a href={`http://${pageAddress}`}>{`http://${pageAddress}`}</a>. A aba Live mostra a imagem para
                  apontar a câmera.
                </p>
                <dl className="row mb-0">
                  <dt className="col-4">Nome</dt>
                  <dd className="col-8">{status?.accessPoint?.ssid ?? 'Aguardando o ponto de acesso...'}</dd>
                  <dt className="col-4">Senha</dt>
                  <dd className="col-8">{status?.accessPoint?.password ?? 'A senha está no adesivo do aparelho.'}</dd>
                  <dt className="col-4">Estado</dt>
                  <dd className="col-8">
                    {status?.accessPoint?.active ? (
                      <span className="badge text-bg-success">No ar</span>
                    ) : (
                      <span className="badge text-bg-secondary">Parada</span>
                    )}
                  </dd>
                </dl>
                {status?.hostname ? (
                  <p className="small text-secondary mt-3 mb-0">
                    Na rede da quadra, se o roteador deixar o celular enxergar o aparelho, o endereço também pode ser{' '}
                    {`http://${status.hostname}.local`}.
                  </p>
                ) : null}
                <p className="small text-secondary mt-2 mb-0">
                  Sem a rede da quadra, o celular pode avisar que não há internet. Mantenha a conexão para ver a câmera.
                </p>
                {status.message ? <p className="small text-secondary mt-2 mb-0">{status.message}</p> : null}
              </>
            )}
          </div>
        </div>

        {status?.available ? (
        <div className="card">
          <div className="card-header">
            <strong>Rede da quadra</strong>
          </div>
          <div className="card-body">
            {status.venue?.connected ? (
              <div className="alert alert-success">
                Conectada em {status.venue.ssid ?? 'uma rede'}
                {typeof status.venue.signal === 'number' ? ` (sinal ${status.venue.signal})` : ''}. Os clipes sobem por
                esta rede.
              </div>
            ) : (
              <div className="alert alert-warning">
                Ainda sem a rede da quadra. Os clipes ficam no aparelho até ela conectar.
              </div>
            )}
            <p className="small text-secondary mb-0">
              Escolher outra rede aqui não apaga a rede do aparelho. A senha da quadra não entra no log.
            </p>
          </div>
        </div>
        ) : null}
      </div>

      {status?.available ? (
        <div className="col-12 col-xl-6">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Redes visíveis</strong>
              <button className="btn btn-outline-secondary btn-sm" disabled={loading || busy} onClick={() => void load()}>
                {loading ? 'Procurando...' : 'Atualizar'}
              </button>
            </div>
            <div className="card-body">
              {error ? <div className="alert alert-danger">{error}</div> : null}
              {message ? <div className="alert alert-info">{message}</div> : null}
              {loading && networks.length === 0 ? <p className="text-secondary">Procurando redes...</p> : null}
              {!loading && networks.length === 0 ? (
                <p className="text-secondary">Nenhuma rede encontrada. Aproxime o aparelho do roteador e atualize.</p>
              ) : null}
              <div className="list-group mb-3">
                {networks.map((network) => (
                  <button
                    key={network.ssid}
                    type="button"
                    className={`list-group-item list-group-item-action ${selectedSsid === network.ssid ? 'active' : ''}`}
                    onClick={() => setSelectedSsid(network.ssid)}
                  >
                    <span className="d-flex justify-content-between">
                      <span>{network.ssid}</span>
                      <span className="small">sinal {network.signal}</span>
                    </span>
                    <span className="small">
                      {securityLabel(network.security)}
                      {network.inUse ? ' · em uso' : ''}
                    </span>
                  </button>
                ))}
              </div>
              <label className="form-label" htmlFor="venue-wifi-password">
                Senha da rede {selectedSsid || 'da quadra'}
              </label>
              <input
                id="venue-wifi-password"
                className="form-control mb-2"
                type="password"
                name="venue-wifi-password"
                autoComplete="off"
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="small text-secondary">Rede aberta: deixe a senha em branco.</p>
              <button className="btn btn-primary w-100" disabled={busy || !selectedSsid} onClick={() => void connect()}>
                {busy ? 'Conectando...' : 'Usar esta rede'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
