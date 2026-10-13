import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';
import type {
  AuthSession,
  EquipmentButton,
  EquipmentCamera,
  EquipmentConfig,
  PublicConfig,
  RecordingDeleteScope,
  RecordingFile,
} from '../electron/ipc-types';

const defaultStatus: ApplicationStatus = {
  cameraStatus: 'offline',
  bufferStatus: 'empty',
  processingStatus: 'idle',
  uploadStatus: 'idle',
  availableBufferSeconds: 0,
  canTrigger: false,
};

const defaultConfig: PublicConfig = {
  storage: {
    maxLocalBytes: 10 * 1024 * 1024 * 1024,
    maxCloudBytes: 10 * 1024 * 1024 * 1024,
  },
};

const defaultEquipmentConfig: EquipmentConfig = {
  cameras: [],
  buttons: [],
  bindings: [],
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function App() {
  const [session, setSession] = useState<AuthSession>({ authenticated: false });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [usernameInput, setUsernameInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('admin');

  const [status, setStatus] = useState<ApplicationStatus>(defaultStatus);
  const [clips, setClips] = useState<ClipMetadata[]>([]);
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [publicConfig, setPublicConfig] = useState<PublicConfig>(defaultConfig);
  const [equipmentConfig, setEquipmentConfig] = useState<EquipmentConfig>(defaultEquipmentConfig);
  const [discoveredCameras, setDiscoveredCameras] = useState<EquipmentCamera[]>([]);
  const [equipmentMessage, setEquipmentMessage] = useState<string | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<'live' | 'videos' | 'equipment'>('live');
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<RecordingDeleteScope>('local');

  const [cameraNameInput, setCameraNameInput] = useState('');
  const [cameraDeviceInput, setCameraDeviceInput] = useState('');
  const [buttonNameInput, setButtonNameInput] = useState('');
  const [buttonTypeInput, setButtonTypeInput] = useState<'virtual' | 'gpio'>('virtual');
  const [buttonPinInput, setButtonPinInput] = useState('17');
  const [buttonChipInput, setButtonChipInput] = useState('gpiochip0');

  const lastPreviewTimestampRef = useRef<number | undefined>(undefined);

  async function refreshRecordings(): Promise<void> {
    const nextRecordings = await window.desktopApi.getRecordings();
    setRecordings(nextRecordings);
  }

  async function refreshEquipmentConfig(): Promise<void> {
    setEquipmentConfig(await window.desktopApi.getEquipmentConfig());
  }

  async function refreshDiscovery(): Promise<void> {
    const discovery = await window.desktopApi.discoverCameras();
    setDiscoveredCameras(discovery.cameras);
  }

  useEffect(() => {
    let disposed = false;

    async function bootstrap(): Promise<void> {
      try {
        const currentSession = await window.desktopApi.getAuthSession();
        if (disposed) {
          return;
        }
        setSession(currentSession);
      } catch (error) {
        if (!disposed) {
          setAuthError(error instanceof Error ? error.message : 'Falha ao verificar sessão');
        }
      } finally {
        if (!disposed) {
          setAuthLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!session.authenticated) {
      return;
    }

    let disposed = false;
    void Promise.all([
      window.desktopApi.getSnapshot().then((snapshot) => {
        if (!disposed) {
          setStatus(snapshot.status);
          setClips(snapshot.clips);
        }
      }),
      refreshRecordings(),
      window.desktopApi.getPublicConfig().then((value) => {
        if (!disposed) {
          setPublicConfig(value);
        }
      }),
      refreshEquipmentConfig(),
      refreshDiscovery(),
    ]).catch((error: unknown) => {
      if (!disposed) {
        setAuthError(error instanceof Error ? error.message : String(error));
      }
    });

    const unsubscribeStatus = window.desktopApi.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
    });
    const unsubscribeClips = window.desktopApi.onClipsChange((nextClips) => {
      setClips(nextClips);
      void refreshRecordings();
    });

    return () => {
      disposed = true;
      unsubscribeStatus();
      unsubscribeClips();
    };
  }, [session.authenticated]);

  useEffect(() => {
    if (!session.authenticated) {
      return;
    }

    let disposed = false;
    async function refreshPreviewFrame(): Promise<void> {
      try {
        const frame = await window.desktopApi.getPreviewFrame();
        if (disposed) {
          return;
        }

        if (frame.imageDataUrl && frame.updatedAt !== lastPreviewTimestampRef.current) {
          lastPreviewTimestampRef.current = frame.updatedAt;
          setPreviewSrc(frame.imageDataUrl);
          setPreviewError(undefined);
          return;
        }

        if (!frame.imageDataUrl && status.cameraStatus === 'online') {
          setPreviewError('Aguardando frames do pipeline da câmera...');
        }
      } catch (error) {
        if (!disposed) {
          setPreviewError(error instanceof Error ? error.message : 'Falha ao obter preview da câmera');
        }
      }
    }

    void refreshPreviewFrame();
    const timer = window.setInterval(() => {
      void refreshPreviewFrame();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [session.authenticated, status.cameraStatus]);

  useEffect(() => {
    if (!session.authenticated || activeTab !== 'videos') {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshRecordings();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeTab, session.authenticated]);

  const clipRows = useMemo(() => {
    return clips.map((clip) => ({
      ...clip,
      timeLabel: new Date(clip.timestamp).toLocaleTimeString('pt-BR'),
    }));
  }, [clips]);

  const localBytesUsed = useMemo(
    () => recordings.reduce((sum, recording) => sum + recording.sizeBytes, 0),
    [recordings],
  );
  const cloudBytesEstimated = useMemo(
    () =>
      recordings
        .filter((recording) => recording.isUploaded || recording.storageStatus === 'uploaded')
        .reduce((sum, recording) => sum + recording.sizeBytes, 0),
    [recordings],
  );

  async function submitLogin(): Promise<void> {
    setAuthError(undefined);
    try {
      const nextSession = await window.desktopApi.login(usernameInput, passwordInput);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Falha no login');
    }
  }

  async function deleteSelectedRecordings(scope: RecordingDeleteScope): Promise<void> {
    if (selectedRecordingIds.length === 0) {
      return;
    }
    const result = await window.desktopApi.deleteRecordings(selectedRecordingIds, scope);
    if (result.errors.length > 0) {
      setEquipmentMessage(`Alguns itens não foram removidos: ${result.errors.map((entry) => entry.id).join(', ')}`);
    } else {
      setEquipmentMessage('Itens removidos com sucesso.');
    }
    setSelectedRecordingIds([]);
    await refreshRecordings();
  }

  function toggleRecordingSelection(recordingId: string, selected: boolean): void {
    setSelectedRecordingIds((current) => {
      if (selected) {
        return current.includes(recordingId) ? current : [...current, recordingId];
      }
      return current.filter((id) => id !== recordingId);
    });
  }

  function addManualCamera(): void {
    if (!cameraNameInput.trim() || !cameraDeviceInput.trim()) {
      setEquipmentMessage('Informe nome e identificador da câmera.');
      return;
    }
    const camera: EquipmentCamera = {
      id: makeId('camera'),
      name: cameraNameInput.trim(),
      deviceId: cameraDeviceInput.trim(),
    };
    setEquipmentConfig((current) => ({
      ...current,
      cameras: [...current.cameras, camera],
    }));
    setCameraNameInput('');
    setCameraDeviceInput('');
    setEquipmentMessage('Câmera adicionada à configuração.');
  }

  function addDetectedCamera(camera: EquipmentCamera): void {
    setEquipmentConfig((current) => {
      const alreadyExists = current.cameras.some((item) => item.deviceId === camera.deviceId);
      if (alreadyExists) {
        return current;
      }
      return {
        ...current,
        cameras: [...current.cameras, { ...camera, id: makeId('camera') }],
      };
    });
    setEquipmentMessage('Câmera detectada adicionada.');
  }

  function addButton(): void {
    if (!buttonNameInput.trim()) {
      setEquipmentMessage('Informe o nome do botão.');
      return;
    }
    const nextButton: EquipmentButton = {
      id: makeId('button'),
      name: buttonNameInput.trim(),
      type: buttonTypeInput,
      gpioChip: buttonTypeInput === 'gpio' ? buttonChipInput.trim() || 'gpiochip0' : undefined,
      gpioPin: buttonTypeInput === 'gpio' ? Number(buttonPinInput) : undefined,
      activeLow: buttonTypeInput === 'gpio' ? true : undefined,
    };
    if (buttonTypeInput === 'gpio' && !Number.isInteger(nextButton.gpioPin)) {
      setEquipmentMessage('GPIO inválido.');
      return;
    }

    setEquipmentConfig((current) => ({
      ...current,
      buttons: [...current.buttons, nextButton],
      bindings: [...current.bindings, { buttonId: nextButton.id, cameraIds: [] }],
    }));
    setButtonNameInput('');
    setEquipmentMessage('Botão adicionado.');
  }

  function toggleBinding(buttonId: string, cameraId: string, selected: boolean): void {
    setEquipmentConfig((current) => ({
      ...current,
      bindings: current.bindings.map((binding) => {
        if (binding.buttonId !== buttonId) {
          return binding;
        }
        const next = new Set(binding.cameraIds);
        if (selected) {
          next.add(cameraId);
        } else {
          next.delete(cameraId);
        }
        return { ...binding, cameraIds: [...next] };
      }),
    }));
  }

  async function validateGpioPin(pin: number, chip?: string): Promise<void> {
    const result = await window.desktopApi.validateGpioPin(pin, chip);
    setEquipmentMessage(result.ok ? `GPIO válido: ${result.message}` : `Falha GPIO: ${result.message}`);
  }

  async function saveEquipmentConfig(): Promise<void> {
    const saved = await window.desktopApi.saveEquipmentConfig(equipmentConfig);
    setEquipmentConfig(saved);
    setEquipmentMessage('Configuração salva. Reinicie o serviço para aplicar novos botões físicos.');
  }

  if (authLoading) {
    return (
      <main className="container py-5">
        <div className="card shadow-sm">
          <div className="card-body">Carregando...</div>
        </div>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-6 col-lg-4">
            <div className="card shadow-sm">
              <div className="card-body">
                <h1 className="h4 mb-3">Login</h1>
                <div className="mb-3">
                  <label className="form-label">Usuário</label>
                  <input
                    className="form-control"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Senha</label>
                  <input
                    type="password"
                    className="form-control"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void submitLogin();
                      }
                    }}
                  />
                </div>
                {authError ? <div className="alert alert-danger py-2">{authError}</div> : null}
                <button className="btn btn-primary w-100" onClick={() => void submitLogin()}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 m-0">Football Clip Recorder</h1>
        <div className="d-flex gap-2">
          <span className="badge text-bg-secondary align-self-center">{session.username}</span>
          <button
            className="btn btn-outline-light btn-sm"
            onClick={() => {
              void window.desktopApi.logout().then(() => setSession({ authenticated: false }));
            }}
          >
            Sair
          </button>
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={activeTab === 'live' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('live')}
          >
            Live
          </button>
        </li>
        <li className="nav-item">
          <button
            className={activeTab === 'videos' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('videos')}
          >
            Vídeos
          </button>
        </li>
        <li className="nav-item">
          <button
            className={activeTab === 'equipment' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('equipment')}
          >
            Gestão de equipamento
          </button>
        </li>
      </ul>

      {activeTab === 'live' ? (
        <div className="row g-3">
          <div className="col-12 col-xl-8">
            <div className="card h-100">
              <div className="card-header">Câmera</div>
              <div className="card-body">
                <div className="preview-frame border rounded p-2 bg-black">
                  {previewSrc ? (
                    <img src={previewSrc} alt="Preview da câmera" className="preview-video w-100" />
                  ) : (
                    <div className="text-center py-5 text-secondary">
                      {previewError ?? 'Aguardando preview da câmera...'}
                    </div>
                  )}
                </div>
                <div className="d-grid mt-3">
                  <button
                    className="btn btn-success btn-lg"
                    disabled={!status.canTrigger}
                    onClick={() => {
                      void window.desktopApi.triggerClip();
                    }}
                  >
                    ⚽ Registrar lance
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <div className="card mb-3">
              <div className="card-header">Status</div>
              <div className="card-body">
                <div><strong>Câmera:</strong> {status.cameraStatus}</div>
                <div><strong>Buffer:</strong> {status.availableBufferSeconds.toFixed(1)}s</div>
                <div><strong>Processamento:</strong> {status.processingStatus}</div>
                <div><strong>Upload:</strong> {status.uploadStatus}</div>
                <div className="mt-2 text-secondary">{status.lastMessage ?? 'Aguardando evento...'}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">Últimos clipes</div>
              <div className="list-group list-group-flush">
                {clipRows.length === 0 ? (
                  <div className="list-group-item text-secondary">Nenhum clipe registrado ainda.</div>
                ) : (
                  clipRows.slice(0, 8).map((clip) => (
                    <div key={clip.id} className="list-group-item">
                      <div className="d-flex justify-content-between">
                        <strong>{clip.timeLabel}</strong>
                        <span>{clip.duration.toFixed(0)}s</span>
                      </div>
                      <div className="small text-secondary">
                        {clip.storageStatus === 'uploaded' ? 'Upload concluído' : 'Pendente'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'videos' ? (
        <div className="card">
          <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
            <strong>Gestão de vídeos</strong>
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-outline-light btn-sm" onClick={() => void refreshRecordings()}>
                Atualizar
              </button>
              <select
                className="form-select form-select-sm"
                value={bulkDeleteScope}
                onChange={(event) => setBulkDeleteScope(event.target.value as RecordingDeleteScope)}
              >
                <option value="local">Excluir apenas local</option>
                <option value="cloud">Excluir apenas nuvem</option>
                <option value="both">Excluir local + nuvem</option>
              </select>
              <button
                className="btn btn-danger btn-sm"
                disabled={selectedRecordingIds.length === 0}
                onClick={() => {
                  void deleteSelectedRecordings(bulkDeleteScope);
                }}
              >
                Excluir selecionados
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="row mb-3">
              <div className="col-md-6">
                <div className="small text-secondary">
                  Local: {formatBytes(localBytesUsed)} / {formatBytes(publicConfig.storage.maxLocalBytes)}
                </div>
              </div>
              <div className="col-md-6">
                <div className="small text-secondary">
                  Nuvem (estimado): {formatBytes(cloudBytesEstimated)} / {formatBytes(publicConfig.storage.maxCloudBytes)}
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-dark table-striped table-hover align-middle">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={recordings.length > 0 && selectedRecordingIds.length === recordings.length}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedRecordingIds(recordings.map((item) => item.id));
                          } else {
                            setSelectedRecordingIds([]);
                          }
                        }}
                      />
                    </th>
                    <th>Arquivo</th>
                    <th>Tamanho</th>
                    <th>Data</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-secondary">Nenhuma gravação disponível.</td>
                    </tr>
                  ) : (
                    recordings.map((recording) => (
                      <tr key={recording.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedRecordingIds.includes(recording.id)}
                            onChange={(event) => toggleRecordingSelection(recording.id, event.target.checked)}
                          />
                        </td>
                        <td>{recording.name}</td>
                        <td>{formatBytes(recording.sizeBytes)}</td>
                        <td>{new Date(recording.modifiedAt).toLocaleString('pt-BR')}</td>
                        <td>{recording.isUploaded ? 'Sincronizado' : 'Local'}</td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-light"
                              onClick={() => {
                                void window.desktopApi.openRecording(recording.path);
                              }}
                            >
                              Abrir
                            </button>
                            <button
                              className="btn btn-outline-warning"
                              onClick={() => {
                                void window.desktopApi.retryUpload(recording.id);
                              }}
                              disabled={recording.storageStatus !== 'pending'}
                            >
                              Reenviar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'equipment' ? (
        <div className="row g-3">
          <div className="col-12 col-xl-6">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>Câmeras</strong>
                <button className="btn btn-outline-light btn-sm" onClick={() => void refreshDiscovery()}>
                  Autodetectar
                </button>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <div className="small text-secondary mb-1">Detectadas</div>
                  <div className="d-flex flex-column gap-2">
                    {discoveredCameras.length === 0 ? (
                      <span className="text-secondary">Nenhuma câmera detectada agora.</span>
                    ) : (
                      discoveredCameras.map((camera) => (
                        <div key={camera.deviceId} className="d-flex justify-content-between align-items-center border rounded p-2">
                          <span>{camera.name} <span className="text-secondary">({camera.deviceId})</span></span>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => addDetectedCamera(camera)}
                          >
                            Adicionar
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border-top pt-3">
                  <div className="small text-secondary mb-2">Cadastro manual</div>
                  <div className="row g-2">
                    <div className="col-md-5">
                      <input
                        className="form-control"
                        placeholder="Nome da câmera"
                        value={cameraNameInput}
                        onChange={(event) => setCameraNameInput(event.target.value)}
                      />
                    </div>
                    <div className="col-md-5">
                      <input
                        className="form-control"
                        placeholder="/dev/video0"
                        value={cameraDeviceInput}
                        onChange={(event) => setCameraDeviceInput(event.target.value)}
                      />
                    </div>
                    <div className="col-md-2 d-grid">
                      <button className="btn btn-primary" onClick={addManualCamera}>Adicionar</button>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="small text-secondary mb-2">Câmeras configuradas</div>
                  <ul className="list-group">
                    {equipmentConfig.cameras.length === 0 ? (
                      <li className="list-group-item text-secondary">Nenhuma câmera cadastrada.</li>
                    ) : (
                      equipmentConfig.cameras.map((camera) => (
                        <li key={camera.id} className="list-group-item d-flex justify-content-between">
                          <span>{camera.name}</span>
                          <span className="text-secondary">{camera.deviceId}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-6">
            <div className="card mb-3">
              <div className="card-header"><strong>Botões</strong></div>
              <div className="card-body">
                <div className="row g-2">
                  <div className="col-md-4">
                    <input
                      className="form-control"
                      placeholder="Nome do botão"
                      value={buttonNameInput}
                      onChange={(event) => setButtonNameInput(event.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <select
                      className="form-select"
                      value={buttonTypeInput}
                      onChange={(event) => setButtonTypeInput(event.target.value as 'virtual' | 'gpio')}
                    >
                      <option value="virtual">Virtual</option>
                      <option value="gpio">Físico (GPIO)</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <input
                      className="form-control"
                      placeholder="PIN"
                      value={buttonPinInput}
                      onChange={(event) => setButtonPinInput(event.target.value)}
                      disabled={buttonTypeInput !== 'gpio'}
                    />
                  </div>
                  <div className="col-md-3">
                    <input
                      className="form-control"
                      placeholder="gpiochip0"
                      value={buttonChipInput}
                      onChange={(event) => setButtonChipInput(event.target.value)}
                      disabled={buttonTypeInput !== 'gpio'}
                    />
                  </div>
                </div>
                <div className="d-flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm" onClick={addButton}>Adicionar botão</button>
                  {buttonTypeInput === 'gpio' ? (
                    <button
                      className="btn btn-outline-light btn-sm"
                      onClick={() => void validateGpioPin(Number(buttonPinInput), buttonChipInput)}
                    >
                      Validar conectividade GPIO
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><strong>Vínculo botão ↔ câmeras</strong></div>
              <div className="card-body">
                {equipmentConfig.buttons.length === 0 ? (
                  <div className="text-secondary">Cadastre botões para criar os vínculos.</div>
                ) : (
                  equipmentConfig.buttons.map((button) => {
                    const binding = equipmentConfig.bindings.find((entry) => entry.buttonId === button.id) ?? {
                      buttonId: button.id,
                      cameraIds: [],
                    };
                    return (
                      <div key={button.id} className="mb-3 border rounded p-2">
                        <div className="fw-semibold">{button.name}</div>
                        <div className="small text-secondary mb-2">
                          {button.type === 'gpio'
                            ? `GPIO ${button.gpioPin ?? '-'} (${button.gpioChip ?? 'gpiochip0'})`
                            : 'Virtual'}
                        </div>
                        <div className="d-flex flex-column gap-1">
                          {equipmentConfig.cameras.length === 0 ? (
                            <span className="text-secondary">Nenhuma câmera para vincular.</span>
                          ) : (
                            equipmentConfig.cameras.map((camera) => (
                              <label key={camera.id} className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={binding.cameraIds.includes(camera.id)}
                                  onChange={(event) =>
                                    toggleBinding(button.id, camera.id, event.target.checked)
                                  }
                                />
                                <span className="form-check-label">{camera.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                <div className="d-grid">
                  <button className="btn btn-success" onClick={() => void saveEquipmentConfig()}>
                    Salvar configuração de equipamento
                  </button>
                </div>
                {equipmentMessage ? <div className="alert alert-info mt-3 py-2">{equipmentMessage}</div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
