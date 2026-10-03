import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApplicationStatus, ClipMetadata } from '@football-clip-recorder/core';

const defaultStatus: ApplicationStatus = {
  cameraStatus: 'offline',
  bufferStatus: 'empty',
  processingStatus: 'idle',
  uploadStatus: 'idle',
  availableBufferSeconds: 0,
  canTrigger: false,
};

interface RecordingFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  isUploaded: boolean;
}

export function App() {
  const [status, setStatus] = useState<ApplicationStatus>(defaultStatus);
  const [clips, setClips] = useState<ClipMetadata[]>([]);
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('live');
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);
  const lastPreviewTimestampRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void window.desktopApi.getSnapshot().then((snapshot) => {
      setStatus(snapshot.status);
      setClips(snapshot.clips);
    });

    const unsubscribeStatus = window.desktopApi.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
    });
    const unsubscribeClips = window.desktopApi.onClipsChange((nextClips) => {
      setClips(nextClips);
    });

    void window.desktopApi.getRecordings().then((nextRecordings) => {
      setRecordings(nextRecordings);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeClips();
    };
  }, []);

  useEffect(() => {
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
          setPreviewError(
            error instanceof Error ? error.message : 'Falha ao obter preview da câmera',
          );
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
  }, [status.cameraStatus]);

  useEffect(() => {
    if (activeTab !== 'recordings') {
      return;
    }

    const interval = window.setInterval(() => {
      void window.desktopApi.getRecordings().then((nextRecordings) => {
        setRecordings(nextRecordings);
      });
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeTab]);

  const clipRows = useMemo(() => {
    return clips.map((clip) => ({
      ...clip,
      timeLabel: new Date(clip.timestamp).toLocaleTimeString('pt-BR'),
    }));
  }, [clips]);

  return (
    <main className="page">
      <section className="panel">
        <h1>FOOTBALL CLIP RECORDER</h1>

        <div className="tab-row">
          <button
            className={activeTab === 'live' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('live')}
          >
            Live
          </button>
          <button
            className={activeTab === 'recordings' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('recordings')}
          >
            Gravações
          </button>
        </div>

        {activeTab === 'live' ? (
          <>
            <div className="section-title">CÂMERA</div>
            <div className="preview-frame">
              {previewSrc ? (
                <img src={previewSrc} alt="Preview da câmera" className="preview-video" />
              ) : previewError ? (
                <div className="preview-placeholder">Preview indisponível: {previewError}</div>
              ) : (
                <div className="preview-placeholder">Aguardando preview da câmera...</div>
              )}
            </div>

            <div className="status-line">
              <span className={status.cameraStatus === 'online' ? 'dot online' : 'dot offline'} />
              Câmera: {status.cameraStatus.toUpperCase()}
            </div>
            <div className="status-line">
              <span className={status.bufferStatus === 'ready' ? 'dot online' : 'dot offline'} />
              Buffer: {status.availableBufferSeconds.toFixed(1)}s disponível
            </div>

            <button
              className="trigger-button"
              disabled={!status.canTrigger}
              onClick={() => {
                void window.desktopApi.triggerClip();
              }}
            >
              ⚽ REGISTRAR LANCE
            </button>

            <div className="section-title">STATUS</div>
            <div className="status-grid">
              <div>Processamento: {status.processingStatus}</div>
              <div>Upload: {status.uploadStatus}</div>
              <div>Buffer: {status.bufferStatus}</div>
              <div>{status.lastMessage ?? 'Aguardando evento...'}</div>
            </div>

            <div className="section-title">ÚLTIMOS CLIPES</div>
            <div className="clips-list">
              {clipRows.length === 0 ? (
                <div className="empty-state">Nenhum clipe registrado ainda.</div>
              ) : (
                clipRows.map((clip) => (
                  <div key={clip.id} className="clip-row">
                    <div className="clip-main">
                      <strong>{clip.timeLabel}</strong>
                      <span>{clip.duration.toFixed(0)}s</span>
                      <span>{clip.storageStatus === 'uploaded' ? 'Upload concluído' : 'Pendente'}</span>
                    </div>
                    <div className="clip-actions">
                      {clip.lastError ? <span className="error-text">{clip.lastError}</span> : null}
                      {clip.storageStatus === 'pending' ? (
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void window.desktopApi.retryUpload(clip.id);
                          }}
                        >
                          Reenviar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="section-title">GRAVAÇÕES</div>
            <div className="recordings-list">
              {recordings.length === 0 ? (
                <div className="empty-state">Nenhuma gravação disponível ainda.</div>
              ) : (
                recordings.map((recording) => (
                  <div key={recording.id} className="recording-row">
                    <div className="recording-meta">
                      <strong>{recording.name}</strong>
                      <span>{(recording.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                      <span>{new Date(recording.modifiedAt).toLocaleString('pt-BR')}</span>
                      <span>{recording.isUploaded ? 'Upload concluído' : 'Local'}</span>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        void window.desktopApi.openRecording(recording.path);
                      }}
                    >
                      Abrir
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
