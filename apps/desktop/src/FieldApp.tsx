import type { ReactNode } from 'react';
import type { ApplicationStatus } from '@football-clip-recorder/core';
import type {
  AuthSession,
  DiscoveredCamera,
  EquipmentConfig,
  HostHealthReport,
  LivePreviewCard,
  PublicConfig,
  RecordingDeleteScope,
  RecordingFile,
} from '../electron/ipc-types';
import { CadastroPanel } from './CadastroPanel';
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
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'ajustes', label: 'Ajustes' },
];

const ADJUSTMENTS: Array<{ id: Exclude<AdjustSection, 'menu'>; title: string; detail: string }> = [
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
  publicConfig: PublicConfig;
  equipmentConfig: EquipmentConfig;
  selectedCourtName: string;
  discoveredCameras: DiscoveredCamera[];
  equipmentMessage?: string;
  onEquipmentConfig: (config: EquipmentConfig) => void;
  onDiscover: () => void;
  onValidateGpio: (pin: number, chip?: string) => void;
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

        {props.screen === 'cadastro' ? (
          <CadastroPanel
            config={props.equipmentConfig}
            discoveredCameras={props.discoveredCameras}
            message={props.equipmentMessage}
            onChange={props.onEquipmentConfig}
            onDiscover={props.onDiscover}
            onValidateGpio={props.onValidateGpio}
            onSave={props.onSaveEquipment}
          />
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
