# Estado atual

Fotografia do comportamento em 2026-10-20. Atualize este arquivo quando uma evolução `concluida` mudar a base. Detalhe de fluxo: [../architecture.md](../architecture.md).

## Fluxo do lance

1. FFmpeg grava a câmera USB em segmentos MP4 de `SEGMENT_DURATION_SECONDS` (padrão 1s) em `runtime/segments/`.
2. O mesmo processo atualiza um JPEG de pré-visualização em `runtime/preview/`.
3. `VideoBuffer` conserva só a janela `BUFFER_DURATION_SECONDS` (padrão 30s) e apaga segmentos antigos.
4. Um gatilho (botão da UI ou GPIO) marca o instante.
5. O sistema espera `POST_EVENT_DURATION_SECONDS` (padrão 3s), escolhe os segmentos da janela e concatena um MP4 em `runtime/clips/`.
6. `UploadQueue` envia o arquivo ao provedor (`mock` ou `s3`) sem parar a captura.
7. A UI recebe estado e histórico por IPC (Electron) ou REST + SSE (servidor).

Enquanto um clipe está em pós-evento ou montagem, `canTrigger` fica falso.

## Estados

| Eixo | Valores |
| --- | --- |
| Câmera | `offline`, `starting`, `online`, `error` |
| Buffer | `empty`, `filling`, `ready` |
| Processamento | `idle`, `capturing-post-event`, `building-clip`, `error` |
| Upload (aplicação) | `idle`, `uploading`, `error` |
| Clipe | `pending`, `uploading`, `uploaded` |

Falha de upload deixa o MP4 local e o clipe em `pending`, com nova tentativa manual ou pela sincronização.

## Onde roda

| Modo | Entrada | Interface |
| --- | --- | --- |
| Desenvolvimento Windows | `npm run dev` | Electron + React |
| Servidor | `npm start` após `npm run build` | `http://<host>:3000` |
| Raspberry Pi | `deploy/raspberry-pi/setup.sh` | Mesma UI, serviço `football-clip-recorder` |

A câmera concreta é `UsbCameraWindows` (DirectShow) ou `UsbCameraLinux` (v4l2, áudio ALSA opcional). Áudio é opcional (`ENABLE_AUDIO`, ganho, denoise).

## Gatilho e equipamento

- Botão virtual da UI sempre pode disparar `POST /api/trigger`.
- `BUTTON_PROVIDER=gpio` acrescenta `GpioButton` (pull-up, ativo em nível baixo, debounce). O doc de Pi registra que o botão físico ainda não foi ensaiado em hardware.
- A aba Gestão de equipamento persiste `runtime/equipment-config.json`: câmeras, botões e vínculos.
- Na subida, câmera e botão principais nascem do `.env` se o arquivo ainda não existir.
- Sem nenhuma câmera `isActive`, a gravação de clipe fica desligada. A captura FFmpeg da câmera configurada no ambiente continua o fluxo de start.
- A pipeline que gera o clipe continua sendo uma câmera, a de `CAMERA_DEVICE` (ou autodetecção).
- Na aba Live, essa câmera aparece sempre. Cada outra câmera ativa vinculada a um botão ativo (virtual ou GPIO) aparece no próprio cartão depois que a configuração é salva. O dispositivo extra abre um FFmpeg só de preview, sem segmentos e sem áudio. O mesmo dispositivo da gravação não é aberto de novo.
- Câmera inativa, câmera sem vínculo ou vínculo só com botão inativo não entra na Live.
- Botões GPIO novos no catálogo ainda só passam a disparar o lance depois de reiniciar o serviço. A visualização atualiza ao salvar.

## Armazenamento

- Disco: até `STORAGE_MAX_PERCENT_FREE` (padrão 50) do espaço disponível para clipes, com teto `STORAGE_MAX_BYTES` (padrão 10 GB). Sincronizados saem primeiro. Apagar um ainda não sincronizado gera `CLIP_EVICTED`.
- Nuvem e mock: teto `CLOUD_MAX_BYTES` no bucket/prefixo ou em `mock-s3/`.
- `SyncService` pausa upload sem conectividade (`SYNC_CONNECTIVITY_URL`) e retoma depois. Estado em `runtime/sync-state.json`.
- Provedor novo implementa `ClipStorage.upload` / `delete` e entra em `createClipStorage`.

## Interface

A interface abre numa tela de login simples: nome do produto, usuário, senha e Entrar. Sessão válida libera as abas Live, Vídeos e Gestão de equipamento, mostra o usuário no topo e oferece Sair. Credencial inválida permanece na tela de login. Em desenvolvimento os campos iniciam com `admin` / `admin`.

A aba Live mostra um cartão por câmera visível, com JPEG atualizado cerca de uma vez por segundo (`GET /api/live-view`). Lista de gravações com download, exclusão local/nuvem/ambos e retry de upload.

API autenticada: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/config`, `GET /api/snapshot`, `GET /api/preview-frame`, `GET /api/live-view`, `GET /api/recordings`, `DELETE /api/recordings`, `GET /api/recordings/:nome`, `GET /api/events`, `POST /api/trigger`, `POST /api/clips/:id/retry`, `GET/PUT /api/equipment`, `GET /api/equipment/discovery`, `POST /api/equipment/validate-gpio`.

## Documentos desencontrados

Preferir este arquivo e o código quando um guia antigo divergir:

- `docs/architecture.md` e `docs/windows-development.md` ainda dizem que o mock guarda os 5 clipes mais recentes. `createClipStorage` aplica `CLOUD_MAX_BYTES`.
