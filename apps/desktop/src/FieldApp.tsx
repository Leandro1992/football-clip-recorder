import type { ReactNode } from 'react';
import type { ApplicationStatus } from '@football-clip-recorder/core';
import type { CourtCloud } from '../../../packages/core/src/courts';
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
import { HealthPanel } from './HealthPanel';
import { NetworkPanel } from './NetworkPanel';
import { VersionPanel } from './VersionPanel';
import {
  cameraLabel,
  processingLabel,
  plainPreviewMessage,
  recordingTitle,
  uploadLabel,
  type AdjustSection,
  type Screen,
} from './field-copy';

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'jogo', label: 'Jogo' },
  { id: 'lances', label: 'Lances' },
  { id: 'quadra', label: 'Quadra' },
  { id: 'ajustes', label: 'Ajustes' },
];

const ADJUSTMENTS: Array<{ id: Exclude<AdjustSection, 'menu'>; title: string; detail: string }> = [
  { id: 'envio', title: 'Envio dos vídeos', detail: 'Cloudflare da quadra em uso' },
  { id: 'rede', title: 'Rede', detail: 'Wi-Fi do aparelho e da quadra' },
  { id: 'saude', title: 'Saúde do aparelho', detail: 'Temperatura, disco e energia' },
  { id: 'versao', title: 'Atualização', detail: 'Trazer a versão nova' },
];

export function FieldApp(props: {
  productName: string;
  authLoading: boolean;
  session: AuthSession;
  authError?: string;
  usernameInput: string;
  passwordInput: string;
  onUsername: (value: string) => void;
  onPassword: (value: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  screen: Screen;
  onScreen: (screen: Screen) => void;
  adjustSection: AdjustSection;
  onAdjustSection: (section: AdjustSection) => void;
  status: ApplicationStatus;
  hostHealth?: HostHealthReport;
  hostHealthError?: string;
  previewError?: string;
  liveCards: LivePreviewCard[];
  clips: Array<{ id: string; timeLabel: string; durationSeconds: number; storageStatus: string }>;
  recordings: RecordingFile[];
  selectedRecordingIds: string[];
  bulkDeleteScope: RecordingDeleteScope;
  onBulkDeleteScope: (scope: RecordingDeleteScope) => void;
  onToggleRecording: (id: string, selected: boolean) => void;
  onDeleteRecordings: () => void;
  onOpenRecording: (path: string) => void;
  onRetryUpload: (id: string) => void;
  localBytes: string;
  localLimit: string;
  cloudBytes: string;
  cloudLimit: string;
  equipmentConfig: EquipmentConfig;
  selectedCourtName: string;
  selectedCourtId: string;
  cameras: EquipmentCamera[];
  buttons: EquipmentButton[];
  bindings: Array<{ buttonId: string; cameraIds: string[] }>;
  discoveredCameras: DiscoveredCamera[];
  equipmentMessage?: string;
  courtNameInput: string;
  cameraNameInput: string;
  cameraDeviceInput: string;
  buttonNameInput: string;
  buttonTypeInput: 'virtual' | 'gpio';
  buttonPinInput: string;
  buttonChipInput: string;
  publicConfig: PublicConfig;
  onCourt: (id: string) => void;
  onRenameCourt: (name: string) => void;
  onCourtNameInput: (value: string) => void;
  onAddCourt: () => void;
  onCloud: (field: keyof CourtCloud, value: string) => void;
  cloud: CourtCloud;
  onDiscover: () => void;
  onAddDetected: (camera: DiscoveredCamera) => void;
  onCameraName: (value: string) => void;
  onCameraDevice: (value: string) => void;
  onAddManualCamera: () => void;
  onUpdateCamera: (id: string, updater: (camera: EquipmentCamera) => EquipmentCamera) => void;
  onRemoveCamera: (id: string) => void;
  onButtonName: (value: string) => void;
  onButtonType: (value: 'virtual' | 'gpio') => void;
  onButtonPin: (value: string) => void;
  onButtonChip: (value: string) => void;
  onAddButton: () => void;
  onValidateGpio: () => void;
  onUpdateButton: (id: string, updater: (button: EquipmentButton) => EquipmentButton) => void;
  onRemoveButton: (id: string) => void;
  onToggleBinding: (buttonId: string, cameraId: string, selected: boolean) => void;
  onSaveEquipment: () => void;
  logo: ReactNode;
}) {
  if (props.authLoading) {
    return (
      <main className="login-screen">
        <p>Carregando...</p>
      </main>
    );
  }

  if (!props.session.authenticated) {
    return (
      <main className="login-screen">
        <section className="surface login-card stack">
          <div className="app-brand">
            {props.logo}
            <div>
              <h1>{props.productName}</h1>
              <p>Entre para ver a quadra</p>
            </div>
          </div>
          <label className="stack">
            <span>Usuário</span>
            <input className="form-control" value={props.usernameInput} onChange={(event) => props.onUsername(event.target.value)} />
          </label>
          <label className="stack">
            <span>Senha</span>
            <input
              className="form-control"
              type="password"
              value={props.passwordInput}
              onChange={(event) => props.onPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  props.onLogin();
                }
              }}
            />
          </label>
          {props.authError ? <div className="alert-bad">{props.authError}</div> : null}
          <button className="btn-primary-field" type="button" onClick={props.onLogin}>
            Entrar
          </button>
        </section>
      </main>
    );
  }

  const recordLabel = props.status.canTrigger
    ? 'Registrar lance'
    : props.status.processingStatus === 'idle'
      ? 'Aguardando a câmera'
      : processingLabel(props.status.processingStatus);
  const stateSentence =
    props.status.processingStatus === 'idle'
      ? `${cameraLabel(props.status.cameraStatus)} · ${props.status.availableBufferSeconds.toFixed(0)}s guardados · ${uploadLabel(props.status.uploadStatus)}`
      : processingLabel(props.status.processingStatus);

  return (
    <>
      <main className="app-shell stack">
        <header className="app-top">
          <div className="app-brand">
            {props.logo}
            <div>
              <h1>{props.productName}</h1>
              <p>{props.selectedCourtName}</p>
            </div>
          </div>
          <button className="logout" type="button" onClick={props.onLogout}>
            Sair
          </button>
        </header>
        <nav className="app-nav" aria-label="Seções">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={props.screen === item.id ? 'page' : undefined}
              onClick={() => props.onScreen(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {props.screen === 'jogo' ? (
          <div className="jogo-layout">
            <section className="stack">
              <p className="court-kicker">{props.selectedCourtName}</p>
              <p className="status-line">{stateSentence}</p>
              {props.hostHealth && props.hostHealth.level !== 'ok' ? (
                <div className={props.hostHealth.level === 'critical' ? 'alert-bad' : 'alert-warn'}>
                  {props.hostHealth.summary}
                </div>
              ) : null}
              {props.previewError ? <div className="alert-bad">{props.previewError}</div> : null}
              {props.liveCards.length === 0 ? (
                <div className="preview-frame">
                  <p className="meta">Abrindo a câmera...</p>
                </div>
              ) : (
                props.liveCards.map((card) => (
                  <article key={card.key} className="stack">
                    <strong>{card.title}</strong>
                    <div className="preview-frame">
                      {card.imageDataUrl ? (
                        <img className="preview-video" src={card.imageDataUrl} alt={`Imagem de ${card.title}`} />
                      ) : (
                        <p className="meta">{plainPreviewMessage(card.message)}</p>
                      )}
                    </div>
                  </article>
                ))
              )}
              <div className="record-bar">
                <button
                  className="btn-record"
                  type="button"
                  disabled={!props.status.canTrigger}
                  onClick={() => {
                    void window.desktopApi.triggerClip();
                  }}
                >
                  {recordLabel}
                </button>
              </div>
            </section>
            <section className="surface stack">
              <strong>Últimos lances</strong>
              {props.clips.length === 0 ? <p className="meta">Nenhum lance ainda.</p> : null}
              {props.clips.slice(0, 6).map((clip) => (
                <div key={clip.id}>
                  <strong>{clip.timeLabel}</strong>
                  <p className="meta">
                    {clip.durationSeconds.toFixed(0)}s · {clip.storageStatus === 'uploaded' ? 'Enviado' : 'No aparelho'}
                  </p>
                </div>
              ))}
              <p className="hint">
                A imagem atualiza a cada {props.publicConfig.preview.intervalSeconds}s para apontar a câmera. O vídeo
                guarda a resolução da câmera.
              </p>
            </section>
          </div>
        ) : null}

        {props.screen === 'lances' ? (
          <section className="stack">
            <div className="surface stack">
              <strong>Lances</strong>
              <p className="meta">
                No aparelho {props.localBytes} de {props.localLimit}. Na nuvem {props.cloudBytes} de {props.cloudLimit}.
              </p>
              <p className="meta">Apagar os selecionados de</p>
              <div className="row-actions">
                {(
                  [
                    ['local', 'Aparelho'],
                    ['cloud', 'Nuvem'],
                    ['both', 'Os dois'],
                  ] as const
                ).map(([scope, label]) => (
                  <button
                    key={scope}
                    type="button"
                    className={props.bulkDeleteScope === scope ? 'btn-primary-field' : 'btn-quiet'}
                    onClick={() => props.onBulkDeleteScope(scope)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  className="btn-danger-quiet"
                  type="button"
                  disabled={props.selectedRecordingIds.length === 0}
                  onClick={props.onDeleteRecordings}
                >
                  Apagar selecionados
                </button>
              </div>
              {props.equipmentMessage ? <div className="alert-note">{props.equipmentMessage}</div> : null}
            </div>
            {props.recordings.length === 0 ? <p className="meta">Nenhum vídeo ainda.</p> : null}
            {props.recordings.map((recording) => {
              const title = recordingTitle(recording.name);
              return (
                <article key={recording.id} className="clip-card">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={props.selectedRecordingIds.includes(recording.id)}
                      onChange={(event) => props.onToggleRecording(recording.id, event.target.checked)}
                    />
                    <span>
                      <strong>{title.title}</strong>
                      <span className="meta">
                        {' '}
                        {title.when || new Date(recording.modifiedAt).toLocaleString('pt-BR')} ·{' '}
                        {recording.isUploaded ? 'Enviado' : 'No aparelho'}
                      </span>
                    </span>
                  </label>
                  <div className="row-actions">
                    <button className="btn-quiet" type="button" onClick={() => props.onOpenRecording(recording.path)}>
                      Abrir
                    </button>
                    <button
                      className="btn-quiet"
                      type="button"
                      disabled={recording.storageStatus !== 'pending'}
                      onClick={() => props.onRetryUpload(recording.id)}
                    >
                      Reenviar
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {props.screen === 'quadra' ? (
          <section className="stack">
            <article className="surface stack">
              <strong>Quadra em uso</strong>
              <label className="stack">
                <span>Quadra</span>
                <select className="form-select" value={props.selectedCourtId} onChange={(event) => props.onCourt(event.target.value)}>
                  {props.equipmentConfig.courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack">
                <span>Nome</span>
                <input className="form-control" value={props.selectedCourtName} onChange={(event) => props.onRenameCourt(event.target.value)} />
              </label>
              <details className="advanced">
                <summary>Nova quadra</summary>
                <div className="stack">
                  <input
                    className="form-control"
                    placeholder="Nome da nova quadra"
                    value={props.courtNameInput}
                    onChange={(event) => props.onCourtNameInput(event.target.value)}
                  />
                  <button className="btn-quiet" type="button" onClick={props.onAddCourt}>
                    Adicionar quadra
                  </button>
                </div>
              </details>
            </article>

            {props.cameras.every((camera) => !camera.isActive) ? (
              <div className="alert-warn">Nenhuma câmera ativa. A gravação fica bloqueada até ativar uma.</div>
            ) : null}

            <article className="surface stack">
              <div className="row-actions">
                <strong>Câmeras</strong>
                <button className="btn-quiet" type="button" onClick={props.onDiscover}>
                  Procurar câmeras
                </button>
              </div>
              {props.discoveredCameras.map((camera) => (
                <div key={camera.deviceId} className="row-actions">
                  <span>
                    {camera.name} <span className="meta">{camera.deviceId}</span>
                  </span>
                  <button className="btn-quiet" type="button" onClick={() => props.onAddDetected(camera)}>
                    Usar
                  </button>
                </div>
              ))}
              {props.cameras.length === 0 ? <p className="meta">Nenhuma câmera nesta quadra.</p> : null}
              {props.cameras.map((camera) => (
                <div key={camera.id} className="stack">
                  <input
                    className="form-control"
                    value={camera.name}
                    aria-label="Nome da câmera"
                    onChange={(event) =>
                      props.onUpdateCamera(camera.id, (current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <details className="advanced">
                    <summary>Dispositivo</summary>
                    <input
                      className="form-control"
                      value={camera.deviceId}
                      aria-label="Dispositivo da câmera"
                      onChange={(event) =>
                        props.onUpdateCamera(camera.id, (current) => ({ ...current, deviceId: event.target.value }))
                      }
                    />
                  </details>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={camera.isActive}
                      onChange={(event) =>
                        props.onUpdateCamera(camera.id, (current) => ({ ...current, isActive: event.target.checked }))
                      }
                    />
                    <span>{camera.isActive ? 'Ativa' : 'Inativa'}</span>
                  </label>
                  {camera.isActive
                    ? props.buttons.map((button) => {
                        const binding = props.bindings.find((entry) => entry.buttonId === button.id);
                        return (
                          <label key={button.id} className="check-row">
                            <input
                              type="checkbox"
                              checked={binding?.cameraIds.includes(camera.id) ?? false}
                              onChange={(event) => props.onToggleBinding(button.id, camera.id, event.target.checked)}
                            />
                            <span>Grava com {button.name}</span>
                          </label>
                        );
                      })
                    : null}
                  <button className="btn-danger-quiet" type="button" onClick={() => props.onRemoveCamera(camera.id)}>
                    Remover câmera
                  </button>
                </div>
              ))}
              <details className="advanced">
                <summary>Informar o dispositivo</summary>
                <div className="stack">
                  <input
                    className="form-control"
                    placeholder="Nome da câmera"
                    value={props.cameraNameInput}
                    onChange={(event) => props.onCameraName(event.target.value)}
                  />
                  <input
                    className="form-control"
                    placeholder="/dev/video0"
                    value={props.cameraDeviceInput}
                    onChange={(event) => props.onCameraDevice(event.target.value)}
                  />
                  <button className="btn-quiet" type="button" onClick={props.onAddManualCamera}>
                    Adicionar
                  </button>
                </div>
              </details>
            </article>

            <article className="surface stack">
              <strong>Botões</strong>
              <input
                className="form-control"
                placeholder="Nome do botão"
                value={props.buttonNameInput}
                onChange={(event) => props.onButtonName(event.target.value)}
              />
              <select
                className="form-select"
                value={props.buttonTypeInput}
                onChange={(event) => props.onButtonType(event.target.value as 'virtual' | 'gpio')}
              >
                <option value="virtual">Botão da tela</option>
                <option value="gpio">Botão físico</option>
              </select>
              {props.buttonTypeInput === 'gpio' ? (
                <div className="stack">
                  <input
                    className="form-control"
                    inputMode="numeric"
                    aria-label="Pino GPIO"
                    value={props.buttonPinInput}
                    onChange={(event) => props.onButtonPin(event.target.value)}
                  />
                  <input
                    className="form-control"
                    aria-label="Chip GPIO"
                    value={props.buttonChipInput}
                    onChange={(event) => props.onButtonChip(event.target.value)}
                  />
                  <button className="btn-quiet" type="button" onClick={props.onValidateGpio}>
                    Testar o pino
                  </button>
                </div>
              ) : null}
              <button className="btn-quiet" type="button" onClick={props.onAddButton}>
                Adicionar botão
              </button>
              {props.buttons.map((button) => (
                <div key={button.id} className="stack">
                  <input
                    className="form-control"
                    value={button.name}
                    aria-label="Nome do botão"
                    onChange={(event) =>
                      props.onUpdateButton(button.id, (current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <p className="meta">
                    {button.type === 'gpio' ? `Físico, pino ${button.gpioPin ?? '-'}` : 'Botão da tela'}
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={button.isActive}
                      onChange={(event) =>
                        props.onUpdateButton(button.id, (current) => ({ ...current, isActive: event.target.checked }))
                      }
                    />
                    <span>{button.isActive ? 'Ativo' : 'Inativo'}</span>
                  </label>
                  <button className="btn-danger-quiet" type="button" onClick={() => props.onRemoveButton(button.id)}>
                    Remover botão
                  </button>
                </div>
              ))}
            </article>

            <button className="btn-primary-field" type="button" onClick={props.onSaveEquipment}>
              Salvar quadra
            </button>
            {props.equipmentMessage ? <div className="alert-note">{props.equipmentMessage}</div> : null}
          </section>
        ) : null}

        {props.screen === 'ajustes' ? (
          <section className="stack">
            {props.adjustSection === 'menu' ? (
              ADJUSTMENTS.map((item) => (
                <button key={item.id} className="choice" type="button" onClick={() => props.onAdjustSection(item.id)}>
                  <span>{item.title}</span>
                  <span className="meta">{item.detail}</span>
                </button>
              ))
            ) : (
              <>
                <button className="btn-quiet" type="button" onClick={() => props.onAdjustSection('menu')}>
                  Voltar
                </button>
                {props.adjustSection === 'envio' ? (
                  <article className="surface stack">
                    <strong>Envio de {props.selectedCourtName}</strong>
                    <p className="meta">
                      Se algum campo ficar vazio, os vídeos continuam indo para o destino geral do aparelho.
                    </p>
                    <label className="stack">
                      <span>Endereço Cloudflare</span>
                      <input
                        className="form-control"
                        placeholder="https://conta.r2.cloudflarestorage.com"
                        value={props.cloud.endpoint}
                        onChange={(event) => props.onCloud('endpoint', event.target.value)}
                      />
                    </label>
                    <label className="stack">
                      <span>Bucket</span>
                      <input className="form-control" value={props.cloud.bucket} onChange={(event) => props.onCloud('bucket', event.target.value)} />
                    </label>
                    <label className="stack">
                      <span>Região</span>
                      <input className="form-control" value={props.cloud.region} onChange={(event) => props.onCloud('region', event.target.value)} />
                    </label>
                    <label className="stack">
                      <span>Access key</span>
                      <input
                        className="form-control"
                        value={props.cloud.accessKeyId}
                        onChange={(event) => props.onCloud('accessKeyId', event.target.value)}
                      />
                    </label>
                    <label className="stack">
                      <span>Secret</span>
                      <input
                        className="form-control"
                        type="password"
                        placeholder="Em branco mantém o secret já salvo"
                        value={props.cloud.secretAccessKey}
                        onChange={(event) => props.onCloud('secretAccessKey', event.target.value)}
                      />
                    </label>
                    <button className="btn-primary-field" type="button" onClick={props.onSaveEquipment}>
                      Salvar envio
                    </button>
                    {props.equipmentMessage ? <div className="alert-note">{props.equipmentMessage}</div> : null}
                  </article>
                ) : null}
                {props.adjustSection === 'rede' ? <NetworkPanel /> : null}
                {props.adjustSection === 'saude' ? <HealthPanel report={props.hostHealth} error={props.hostHealthError} /> : null}
                {props.adjustSection === 'versao' ? <VersionPanel /> : null}
              </>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
