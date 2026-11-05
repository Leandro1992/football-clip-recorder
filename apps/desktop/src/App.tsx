import { useEffect, useMemo, useState } from 'react';
import type { ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';
import { activeCourt, createCourt, mapActiveCourt, type CourtCloud } from '../../../packages/core/src/courts';
import type {
  AuthSession,
  DiscoveredCamera,
  EquipmentButton,
  EquipmentCamera,
  EquipmentConfig,
  HostHealthReport,
  LivePreviewCard,
  PublicConfig,
  RecordingDeleteScope,
  RecordingFile,
} from '../electron/ipc-types';
import { FieldApp } from './FieldApp';
import type { AdjustSection, Screen } from './field-copy';

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
  preview: {
    width: 480,
    intervalSeconds: 2,
  },
};

const defaultEquipmentConfig: EquipmentConfig = {
  activeCourtId: 'quadra-principal',
  courts: [createCourt('quadra-principal', 'Quadra principal')],
};
const PRODUCT_NAME = 'Olho no lance';

function BrandLogo({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'brand-logo brand-logo-sm' : 'brand-logo'}
      viewBox="0 0 64 64"
      role="img"
      aria-label={PRODUCT_NAME}
    >
      <defs>
        <linearGradient id="olhoNoLanceGradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#1f8a52" />
          <stop offset="100%" stopColor="#0c3d26" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#olhoNoLanceGradient)" />
      <ellipse cx="32" cy="32" rx="20" ry="13" fill="#0f172a" opacity="0.95" />
      <circle cx="32" cy="32" r="8.5" fill="#22c55e" />
      <circle cx="32" cy="32" r="4.3" fill="#f8fafc" />
      <path d="M20 48 L32 41 L44 48" stroke="#f8fafc" strokeWidth="2.5" fill="none" opacity="0.9" />
    </svg>
  );
}

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
  const [discoveredCameras, setDiscoveredCameras] = useState<DiscoveredCamera[]>([]);
  const [equipmentMessage, setEquipmentMessage] = useState<string | undefined>(undefined);

  const [screen, setScreen] = useState<Screen>('jogo');
  const [adjustSection, setAdjustSection] = useState<AdjustSection>('menu');
  const [hostHealth, setHostHealth] = useState<HostHealthReport | undefined>(undefined);
  const [hostHealthError, setHostHealthError] = useState<string | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [liveCards, setLiveCards] = useState<LivePreviewCard[]>([]);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<RecordingDeleteScope>('local');

  const [cameraNameInput, setCameraNameInput] = useState('');
  const [cameraDeviceInput, setCameraDeviceInput] = useState('');
  const [buttonNameInput, setButtonNameInput] = useState('');
  const [courtNameInput, setCourtNameInput] = useState('');
  const [buttonTypeInput, setButtonTypeInput] = useState<'virtual' | 'gpio'>('virtual');
  const [buttonPinInput, setButtonPinInput] = useState('17');
  const [buttonChipInput, setButtonChipInput] = useState('gpiochip0');

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
    if (!session.authenticated || screen !== 'jogo') {
      return;
    }

    let disposed = false;
    let refreshing = false;
    async function refreshLiveView(): Promise<void> {
      if (refreshing) {
        return;
      }
      refreshing = true;
      try {
        const view = await window.desktopApi.getLiveView();
        if (disposed) {
          return;
        }
        setLiveCards(view.cards);
        setPreviewError(undefined);
      } catch (error) {
        if (!disposed) {
          setPreviewError(error instanceof Error ? error.message : 'Falha ao obter a visualização');
        }
      } finally {
        refreshing = false;
      }
    }

    void refreshLiveView();
    const timer = window.setInterval(() => {
      void refreshLiveView();
    }, publicConfig.preview.intervalSeconds * 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [session.authenticated, screen, publicConfig.preview.intervalSeconds]);

  useEffect(() => {
    if (!session.authenticated || (screen !== 'jogo' && !(screen === 'ajustes' && adjustSection === 'saude'))) {
      return;
    }

    let disposed = false;
    let refreshing = false;
    async function refreshHealth(): Promise<void> {
      if (refreshing) {
        return;
      }
      refreshing = true;
      try {
        const report = await window.desktopApi.getHostHealth();
        if (!disposed) {
          setHostHealth(report);
          setHostHealthError(undefined);
        }
      } catch (error) {
        if (!disposed) {
          setHostHealthError(error instanceof Error ? error.message : 'Falha ao ler a saúde do equipamento');
        }
      } finally {
        refreshing = false;
      }
    }

    void refreshHealth();
    const timer = window.setInterval(() => {
      void refreshHealth();
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [session.authenticated, screen, adjustSection]);

  useEffect(() => {
    if (!session.authenticated || screen !== 'lances') {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshRecordings();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [screen, session.authenticated]);

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
      isActive: true,
    };
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        cameras: [...court.cameras, camera],
      })),
    );
    setCameraNameInput('');
    setCameraDeviceInput('');
    setEquipmentMessage('Câmera adicionada à configuração.');
  }

  function addDetectedCamera(camera: DiscoveredCamera): void {
    setEquipmentConfig((current) => {
      const court = activeCourt(current);
      const alreadyExists = court.cameras.some((item) => item.deviceId === camera.deviceId);
      if (alreadyExists) {
        return current;
      }
      return mapActiveCourt(current, (selected) => ({
        ...selected,
        cameras: [...selected.cameras, { ...camera, id: makeId('camera'), isActive: true }],
      }));
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
      isActive: true,
      gpioChip: buttonTypeInput === 'gpio' ? buttonChipInput.trim() || 'gpiochip0' : undefined,
      gpioPin: buttonTypeInput === 'gpio' ? Number(buttonPinInput) : undefined,
      activeLow: buttonTypeInput === 'gpio' ? true : undefined,
    };
    if (buttonTypeInput === 'gpio' && !Number.isInteger(nextButton.gpioPin)) {
      setEquipmentMessage('GPIO inválido.');
      return;
    }

    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        buttons: [...court.buttons, nextButton],
        bindings: [...court.bindings, { buttonId: nextButton.id, cameraIds: [] }],
      })),
    );
    setButtonNameInput('');
    setEquipmentMessage('Botão adicionado.');
  }

  function toggleBinding(buttonId: string, cameraId: string, selected: boolean): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        bindings: court.bindings.map((binding) => {
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
      })),
    );
  }

  function updateCamera(cameraId: string, updater: (camera: EquipmentCamera) => EquipmentCamera): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        cameras: court.cameras.map((camera) => (camera.id === cameraId ? updater(camera) : camera)),
      })),
    );
  }

  function removeCamera(cameraId: string): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        cameras: court.cameras.filter((camera) => camera.id !== cameraId),
        bindings: court.bindings.map((binding) => ({
          ...binding,
          cameraIds: binding.cameraIds.filter((id) => id !== cameraId),
        })),
      })),
    );
    setEquipmentMessage('Câmera removida.');
  }

  function updateButton(buttonId: string, updater: (button: EquipmentButton) => EquipmentButton): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        buttons: court.buttons.map((button) => (button.id === buttonId ? updater(button) : button)),
      })),
    );
  }

  function removeButton(buttonId: string): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        buttons: court.buttons.filter((button) => button.id !== buttonId),
        bindings: court.bindings.filter((binding) => binding.buttonId !== buttonId),
      })),
    );
    setEquipmentMessage('Botão removido.');
  }

  async function validateGpioPin(pin: number, chip?: string): Promise<void> {
    const result = await window.desktopApi.validateGpioPin(pin, chip);
    setEquipmentMessage(result.ok ? `GPIO válido: ${result.message}` : `Falha GPIO: ${result.message}`);
  }

  function addCourt(): void {
    const name = courtNameInput.trim();
    if (!name) {
      setEquipmentMessage('Informe o nome da quadra.');
      return;
    }
    const court = createCourt(`q${Date.now().toString(36)}`, name);
    setEquipmentConfig((current) => ({
      ...current,
      activeCourtId: court.id,
      courts: [...current.courts, court],
    }));
    setCourtNameInput('');
    setEquipmentMessage('Quadra adicionada. Salve para guardar.');
  }

  function updateCourtCloud(field: keyof CourtCloud, value: string): void {
    setEquipmentConfig((current) =>
      mapActiveCourt(current, (court) => ({
        ...court,
        cloud: { ...court.cloud, [field]: value },
      })),
    );
  }

  function renameActiveCourt(name: string): void {
    setEquipmentConfig((current) => mapActiveCourt(current, (court) => ({ ...court, name })));
  }

  async function saveEquipmentConfig(): Promise<void> {
    const saved = await window.desktopApi.saveEquipmentConfig(equipmentConfig);
    setEquipmentConfig(saved);
    setEquipmentMessage(
      'Configuração salva. A quadra em uso, uma câmera nova ou um botão novo passam a gravar depois de reiniciar o serviço. O nome do vídeo leva a quadra, a câmera e o horário.',
    );
  }

  const selectedCourt = activeCourt(equipmentConfig);

  return (
    <FieldApp
      productName={PRODUCT_NAME}
      logo={<BrandLogo small />}
      authLoading={authLoading}
      session={session}
      authError={authError}
      usernameInput={usernameInput}
      passwordInput={passwordInput}
      onUsername={setUsernameInput}
      onPassword={setPasswordInput}
      onLogin={() => void submitLogin()}
      onLogout={() => {
        void window.desktopApi.logout().then(() => setSession({ authenticated: false }));
      }}
      screen={screen}
      onScreen={setScreen}
      adjustSection={adjustSection}
      onAdjustSection={setAdjustSection}
      status={status}
      hostHealth={hostHealth}
      hostHealthError={hostHealthError}
      previewError={previewError}
      liveCards={liveCards}
      clips={clipRows.map((clip) => ({
        id: clip.id,
        timeLabel: clip.timeLabel,
        durationSeconds: clip.duration,
        storageStatus: clip.storageStatus,
      }))}
      recordings={recordings}
      selectedRecordingIds={selectedRecordingIds}
      bulkDeleteScope={bulkDeleteScope}
      onBulkDeleteScope={setBulkDeleteScope}
      onToggleRecording={toggleRecordingSelection}
      onDeleteRecordings={() => void deleteSelectedRecordings(bulkDeleteScope)}
      onOpenRecording={(path) => {
        void window.desktopApi.openRecording(path);
      }}
      onRetryUpload={(id) => {
        void window.desktopApi.retryUpload(id);
      }}
      localBytes={formatBytes(localBytesUsed)}
      localLimit={formatBytes(publicConfig.storage.maxLocalBytes)}
      cloudBytes={formatBytes(cloudBytesEstimated)}
      cloudLimit={formatBytes(publicConfig.storage.maxCloudBytes)}
      equipmentConfig={equipmentConfig}
      selectedCourtName={selectedCourt.name}
      selectedCourtId={selectedCourt.id}
      cameras={selectedCourt.cameras}
      buttons={selectedCourt.buttons}
      bindings={selectedCourt.bindings}
      discoveredCameras={discoveredCameras}
      equipmentMessage={equipmentMessage}
      courtNameInput={courtNameInput}
      cameraNameInput={cameraNameInput}
      cameraDeviceInput={cameraDeviceInput}
      buttonNameInput={buttonNameInput}
      buttonTypeInput={buttonTypeInput}
      buttonPinInput={buttonPinInput}
      buttonChipInput={buttonChipInput}
      publicConfig={publicConfig}
      onCourt={(id) => setEquipmentConfig((current) => ({ ...current, activeCourtId: id }))}
      onRenameCourt={renameActiveCourt}
      onCourtNameInput={setCourtNameInput}
      onAddCourt={addCourt}
      onCloud={updateCourtCloud}
      cloud={selectedCourt.cloud}
      onDiscover={() => void refreshDiscovery()}
      onAddDetected={addDetectedCamera}
      onCameraName={setCameraNameInput}
      onCameraDevice={setCameraDeviceInput}
      onAddManualCamera={addManualCamera}
      onUpdateCamera={updateCamera}
      onRemoveCamera={removeCamera}
      onButtonName={setButtonNameInput}
      onButtonType={setButtonTypeInput}
      onButtonPin={setButtonPinInput}
      onButtonChip={setButtonChipInput}
      onAddButton={addButton}
      onValidateGpio={() => void validateGpioPin(Number(buttonPinInput), buttonChipInput)}
      onUpdateButton={updateButton}
      onRemoveButton={removeButton}
      onToggleBinding={toggleBinding}
      onSaveEquipment={() => void saveEquipmentConfig()}
    />
  );
}
