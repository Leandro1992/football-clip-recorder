import { useEffect, useState } from 'react';
import type { Court, EquipmentConfig, StorageBucket } from '../../../packages/core/src/courts';
import type { DiscoveredCamera } from '../electron/ipc-types';

interface CourtDraft {
  id: string;
  name: string;
  cameraIds: string[];
  buttonIds: string[];
  bucketId: string;
  makeActive: boolean;
  isNew: boolean;
}

function nextId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

function draftFor(config: EquipmentConfig, courtId: string): CourtDraft {
  const court = config.courts.find((item) => item.id === courtId) ?? config.courts[0];
  if (!court) {
    return { id: nextId('q'), name: '', cameraIds: [], buttonIds: [], bucketId: '', makeActive: true, isNew: true };
  }
  return {
    id: court.id,
    name: court.name,
    cameraIds: [...court.cameraIds],
    buttonIds: [...court.buttonIds],
    bucketId: court.bucketId,
    makeActive: config.activeCourtId === court.id,
    isNew: false,
  };
}

function toggleId(ids: string[], id: string, selected: boolean): string[] {
  if (selected) {
    return ids.includes(id) ? ids : [...ids, id];
  }
  return ids.filter((item) => item !== id);
}

function missingAssociation(draft: CourtDraft): string | undefined {
  const missing: string[] = [];
  if (!draft.name.trim()) {
    missing.push('um nome');
  }
  if (draft.cameraIds.length === 0) {
    missing.push('ao menos uma câmera');
  }
  if (!draft.bucketId) {
    missing.push('um bucket');
  }
  if (draft.buttonIds.length === 0) {
    missing.push('ao menos um botão');
  }
  if (missing.length === 0) {
    return undefined;
  }
  if (missing.length === 1) {
    return `A quadra precisa de ${missing[0]}.`;
  }
  return `A quadra precisa de ${missing.slice(0, -1).join(', ')} e ${missing[missing.length - 1]}.`;
}

export function CadastroPanel(props: {
  config: EquipmentConfig;
  discoveredCameras: DiscoveredCamera[];
  message?: string;
  onChange: (config: EquipmentConfig) => void;
  onDiscover: () => void;
  onValidateGpio: (pin: number, chip?: string) => void;
  onSave: () => void;
}) {
  const { config, onChange } = props;
  const [cameraName, setCameraName] = useState('');
  const [cameraDevice, setCameraDevice] = useState('');
  const [bucketDraft, setBucketDraft] = useState<StorageBucket>({
    id: '',
    name: '',
    endpoint: '',
    bucket: '',
    region: 'auto',
    accessKeyId: '',
    secretAccessKey: '',
  });
  const [buttonName, setButtonName] = useState('');
  const [buttonType, setButtonType] = useState<'virtual' | 'gpio'>('virtual');
  const [buttonPin, setButtonPin] = useState('17');
  const [buttonChip, setButtonChip] = useState('gpiochip0');
  const [draft, setDraft] = useState<CourtDraft>(() => draftFor(config, config.activeCourtId));
  const [courtTouched, setCourtTouched] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const courtSignature = `${config.activeCourtId}|${config.courts.map((court) => `${court.id}:${court.name}:${court.cameraIds.join('.')}:${court.buttonIds.join('.')}:${court.bucketId}`).join('|')}`;

  useEffect(() => {
    if (!courtTouched) {
      setDraft(draftFor(config, config.activeCourtId));
    }
  }, [courtSignature, courtTouched, config]);

  function addCamera(name: string, deviceId: string): void {
    const trimmedName = name.trim();
    const trimmedDevice = deviceId.trim();
    if (!trimmedName || !trimmedDevice) {
      setNotice('Informe o nome e o dispositivo da câmera.');
      return;
    }
    onChange({
      ...config,
      cameras: [...config.cameras, { id: nextId('cam-'), name: trimmedName, deviceId: trimmedDevice, isActive: true }],
    });
    setCameraName('');
    setCameraDevice('');
    setNotice(undefined);
  }

  function addBucket(): void {
    if (!bucketDraft.name.trim()) {
      setNotice('Informe o nome do bucket.');
      return;
    }
    onChange({
      ...config,
      buckets: [...config.buckets, { ...bucketDraft, id: nextId('bucket-'), name: bucketDraft.name.trim(), region: bucketDraft.region.trim() || 'auto' }],
    });
    setBucketDraft({ id: '', name: '', endpoint: '', bucket: '', region: 'auto', accessKeyId: '', secretAccessKey: '' });
    setNotice(undefined);
  }

  function addButton(): void {
    if (!buttonName.trim()) {
      setNotice('Informe o nome do botão.');
      return;
    }
    const pin = Number(buttonPin);
    if (buttonType === 'gpio' && !Number.isInteger(pin)) {
      setNotice('O pino do botão físico precisa ser um número.');
      return;
    }
    onChange({
      ...config,
      buttons: [
        ...config.buttons,
        {
          id: nextId('btn-'),
          name: buttonName.trim(),
          type: buttonType,
          isActive: true,
          gpioPin: buttonType === 'gpio' ? pin : undefined,
          gpioChip: buttonType === 'gpio' ? buttonChip.trim() || 'gpiochip0' : undefined,
        },
      ],
    });
    setButtonName('');
    setNotice(undefined);
  }

  function editDraft(next: CourtDraft): void {
    setCourtTouched(true);
    setDraft(next);
  }

  function keepCourt(): void {
    const problem = missingAssociation(draft);
    if (problem) {
      setNotice(problem);
      return;
    }
    const court: Court = {
      id: draft.id,
      name: draft.name.trim(),
      cameraIds: draft.cameraIds.filter((id) => config.cameras.some((camera) => camera.id === id)),
      buttonIds: draft.buttonIds.filter((id) => config.buttons.some((button) => button.id === id)),
      bucketId: config.buckets.some((bucket) => bucket.id === draft.bucketId) ? draft.bucketId : '',
    };
    if (court.cameraIds.length === 0 || court.buttonIds.length === 0 || !court.bucketId) {
      setNotice('A quadra precisa de ao menos uma câmera, um bucket e um botão.');
      return;
    }
    const exists = config.courts.some((item) => item.id === court.id);
    const courts = exists ? config.courts.map((item) => (item.id === court.id ? court : item)) : [...config.courts, court];
    let activeCourtId = config.activeCourtId;
    if (draft.makeActive) {
      activeCourtId = court.id;
    } else if (activeCourtId === court.id) {
      activeCourtId = courts.find((item) => item.id !== court.id)?.id ?? court.id;
    }
    onChange({ ...config, activeCourtId, courts });
    editDraft({ ...draft, id: court.id, name: court.name, cameraIds: court.cameraIds, buttonIds: court.buttonIds, bucketId: court.bucketId, isNew: false });
    setNotice('Quadra guardada. Salve no aparelho para manter.');
  }

  return (
    <section className="stack">
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
            <button className="btn-quiet" type="button" onClick={() => addCamera(camera.name, camera.deviceId)}>
              Usar
            </button>
          </div>
        ))}
        {config.cameras.length === 0 ? <p className="meta">Nenhuma câmera cadastrada.</p> : null}
        {config.cameras.map((camera) => (
          <div key={camera.id} className="stack">
            <input
              className="form-control"
              aria-label="Nome da câmera"
              value={camera.name}
              onChange={(event) =>
                onChange({
                  ...config,
                  cameras: config.cameras.map((item) => (item.id === camera.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <details className="advanced">
              <summary>Dispositivo</summary>
              <input
                className="form-control"
                aria-label="Dispositivo da câmera"
                value={camera.deviceId}
                onChange={(event) =>
                  onChange({
                    ...config,
                    cameras: config.cameras.map((item) => (item.id === camera.id ? { ...item, deviceId: event.target.value } : item)),
                  })
                }
              />
            </details>
            <label className="check-row">
              <input
                type="checkbox"
                checked={camera.isActive}
                onChange={(event) =>
                  onChange({
                    ...config,
                    cameras: config.cameras.map((item) => (item.id === camera.id ? { ...item, isActive: event.target.checked } : item)),
                  })
                }
              />
              <span>{camera.isActive ? 'Ativa' : 'Inativa'}</span>
            </label>
            <button
              className="btn-danger-quiet"
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  cameras: config.cameras.filter((item) => item.id !== camera.id),
                  courts: config.courts.map((court) => ({ ...court, cameraIds: court.cameraIds.filter((id) => id !== camera.id) })),
                })
              }
            >
              Remover câmera
            </button>
          </div>
        ))}
        <details className="advanced">
          <summary>Informar o dispositivo</summary>
          <div className="stack">
            <input className="form-control" placeholder="Nome da câmera" value={cameraName} onChange={(event) => setCameraName(event.target.value)} />
            <input className="form-control" placeholder="/dev/video0" value={cameraDevice} onChange={(event) => setCameraDevice(event.target.value)} />
            <button className="btn-quiet" type="button" onClick={() => addCamera(cameraName, cameraDevice)}>
              Adicionar câmera
            </button>
          </div>
        </details>
      </article>

      <article className="surface stack">
        <strong>Buckets</strong>
        <p className="meta">A access key e o secret ficam visíveis nesta tela, que só abre depois do login.</p>
        {config.buckets.map((bucket) => (
          <div key={bucket.id} className="stack">
            <input
              className="form-control"
              aria-label="Nome do bucket"
              value={bucket.name}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <input
              className="form-control"
              aria-label="Endereço Cloudflare"
              placeholder="https://conta.r2.cloudflarestorage.com"
              value={bucket.endpoint}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, endpoint: event.target.value } : item)),
                })
              }
            />
            <input
              className="form-control"
              aria-label="Nome no Cloudflare"
              placeholder="Nome no Cloudflare"
              value={bucket.bucket}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, bucket: event.target.value } : item)),
                })
              }
            />
            <input
              className="form-control"
              aria-label="Região"
              value={bucket.region}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, region: event.target.value } : item)),
                })
              }
            />
            <input
              className="form-control"
              aria-label="Access key"
              autoComplete="off"
              value={bucket.accessKeyId}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, accessKeyId: event.target.value } : item)),
                })
              }
            />
            <input
              className="form-control"
              aria-label="Secret"
              autoComplete="off"
              value={bucket.secretAccessKey}
              onChange={(event) =>
                onChange({
                  ...config,
                  buckets: config.buckets.map((item) => (item.id === bucket.id ? { ...item, secretAccessKey: event.target.value } : item)),
                })
              }
            />
            <button
              className="btn-danger-quiet"
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  buckets: config.buckets.filter((item) => item.id !== bucket.id),
                  courts: config.courts.map((court) => ({ ...court, bucketId: court.bucketId === bucket.id ? '' : court.bucketId })),
                })
              }
            >
              Remover bucket
            </button>
          </div>
        ))}
        <details className="advanced">
          <summary>Novo bucket</summary>
          <div className="stack">
            <input className="form-control" placeholder="Nome do bucket" value={bucketDraft.name} onChange={(event) => setBucketDraft({ ...bucketDraft, name: event.target.value })} />
            <input className="form-control" aria-label="Endereço do novo bucket" placeholder="https://conta.r2.cloudflarestorage.com" value={bucketDraft.endpoint} onChange={(event) => setBucketDraft({ ...bucketDraft, endpoint: event.target.value })} />
            <input className="form-control" aria-label="Bucket no Cloudflare" placeholder="Nome no Cloudflare" value={bucketDraft.bucket} onChange={(event) => setBucketDraft({ ...bucketDraft, bucket: event.target.value })} />
            <input className="form-control" aria-label="Região do novo bucket" value={bucketDraft.region} onChange={(event) => setBucketDraft({ ...bucketDraft, region: event.target.value })} />
            <input className="form-control" aria-label="Access key do novo bucket" autoComplete="off" placeholder="Access key" value={bucketDraft.accessKeyId} onChange={(event) => setBucketDraft({ ...bucketDraft, accessKeyId: event.target.value })} />
            <input className="form-control" aria-label="Secret do novo bucket" autoComplete="off" placeholder="Secret" value={bucketDraft.secretAccessKey} onChange={(event) => setBucketDraft({ ...bucketDraft, secretAccessKey: event.target.value })} />
            <button className="btn-quiet" type="button" onClick={addBucket}>
              Adicionar bucket
            </button>
          </div>
        </details>
      </article>

      <article className="surface stack">
        <strong>Botões</strong>
        {config.buttons.map((button) => (
          <div key={button.id} className="stack">
            <input
              className="form-control"
              aria-label="Nome do botão"
              value={button.name}
              onChange={(event) =>
                onChange({
                  ...config,
                  buttons: config.buttons.map((item) => (item.id === button.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <p className="meta">{button.type === 'gpio' ? `Físico, pino ${button.gpioPin ?? '-'}` : 'Botão da tela'}</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={button.isActive}
                onChange={(event) =>
                  onChange({
                    ...config,
                    buttons: config.buttons.map((item) => (item.id === button.id ? { ...item, isActive: event.target.checked } : item)),
                  })
                }
              />
              <span>{button.isActive ? 'Ativo' : 'Inativo'}</span>
            </label>
            <button
              className="btn-danger-quiet"
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  buttons: config.buttons.filter((item) => item.id !== button.id),
                  courts: config.courts.map((court) => ({ ...court, buttonIds: court.buttonIds.filter((id) => id !== button.id) })),
                })
              }
            >
              Remover botão
            </button>
          </div>
        ))}
        <details className="advanced">
          <summary>Novo botão</summary>
          <div className="stack">
            <input className="form-control" placeholder="Nome do botão" value={buttonName} onChange={(event) => setButtonName(event.target.value)} />
            <select className="form-select" value={buttonType} onChange={(event) => setButtonType(event.target.value as 'virtual' | 'gpio')}>
              <option value="virtual">Botão da tela</option>
              <option value="gpio">Botão físico</option>
            </select>
            {buttonType === 'gpio' ? (
              <>
                <input className="form-control" inputMode="numeric" aria-label="Pino GPIO" value={buttonPin} onChange={(event) => setButtonPin(event.target.value)} />
                <input className="form-control" aria-label="Chip GPIO" value={buttonChip} onChange={(event) => setButtonChip(event.target.value)} />
                <button className="btn-quiet" type="button" onClick={() => props.onValidateGpio(Number(buttonPin), buttonChip)}>
                  Testar o pino
                </button>
              </>
            ) : null}
            <button className="btn-quiet" type="button" onClick={addButton}>
              Adicionar botão
            </button>
          </div>
        </details>
      </article>

      <article className="surface stack">
        <strong>Quadra</strong>
        <p className="meta">Associe uma ou mais câmeras, um bucket e um ou mais botões. Cada botão grava todas as câmeras ativas da quadra.</p>
        <label className="stack">
          <span>Quadra</span>
          <select
            className="form-select"
            value={draft.isNew ? 'new' : draft.id}
            onChange={(event) => {
              if (event.target.value === 'new') {
                editDraft({ id: nextId('q'), name: '', cameraIds: [], buttonIds: [], bucketId: '', makeActive: true, isNew: true });
                setNotice(undefined);
                return;
              }
              editDraft(draftFor(config, event.target.value));
              setNotice(undefined);
            }}
          >
            {config.courts.map((court) => (
              <option key={court.id} value={court.id}>
                {court.name}
              </option>
            ))}
            <option value="new">Nova quadra</option>
          </select>
        </label>
        <label className="stack">
          <span>Nome</span>
          <input className="form-control" value={draft.name} onChange={(event) => editDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className="stack">
          <span>Câmeras</span>
          {config.cameras.length === 0 ? <p className="meta">Cadastre uma câmera antes.</p> : null}
          {config.cameras.map((camera) => (
            <label key={camera.id} className="check-row">
              <input
                type="checkbox"
                checked={draft.cameraIds.includes(camera.id)}
                onChange={(event) => editDraft({ ...draft, cameraIds: toggleId(draft.cameraIds, camera.id, event.target.checked) })}
              />
              <span>{camera.name}</span>
            </label>
          ))}
        </div>
        <label className="stack">
          <span>Bucket</span>
          <select className="form-select" value={draft.bucketId} onChange={(event) => editDraft({ ...draft, bucketId: event.target.value })}>
            <option value="">Escolher bucket</option>
            {config.buckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name}
              </option>
            ))}
          </select>
        </label>
        <div className="stack">
          <span>Botões</span>
          {config.buttons.length === 0 ? <p className="meta">Cadastre um botão antes.</p> : null}
          {config.buttons.map((button) => (
            <label key={button.id} className="check-row">
              <input
                type="checkbox"
                checked={draft.buttonIds.includes(button.id)}
                onChange={(event) => editDraft({ ...draft, buttonIds: toggleId(draft.buttonIds, button.id, event.target.checked) })}
              />
              <span>{button.name}</span>
            </label>
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={draft.makeActive} onChange={(event) => editDraft({ ...draft, makeActive: event.target.checked })} />
          <span>Usar esta quadra</span>
        </label>
        <button className="btn-quiet" type="button" onClick={keepCourt}>
          Guardar quadra
        </button>
      </article>

      <button className="btn-primary-field" type="button" onClick={props.onSave}>
        Salvar no aparelho
      </button>
      {notice ? <div className="alert-note">{notice}</div> : null}
      {props.message ? <div className="alert-note">{props.message}</div> : null}
    </section>
  );
}
