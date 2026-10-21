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
- A pipeline que gera o clipe é uma por câmera ativa vinculada a um botão ativo. Cada dispositivo é aberto uma vez, com segmentos e JPEG.
- Um botão com várias câmeras gera um clipe de cada uma, e os clipes entram na fila de upload. Dois botões ativos no mesmo pino GPIO disparam a união dessas câmeras.
- O microfone fica na primeira câmera vinculada. As outras gravam só vídeo.
- Na aba Live, cada uma dessas câmeras tem o próprio cartão. A falha de uma não esconde as outras.
- Botões GPIO novos e câmeras novas no catálogo passam a gravar depois de reiniciar o serviço. Mudar o vínculo de câmeras que já estão abertas vale no próximo aperto.

## Armazenamento

- Disco: até `STORAGE_MAX_PERCENT_FREE` (padrão 50) do espaço disponível para clipes, com teto `STORAGE_MAX_BYTES` (padrão 10 GB). Sincronizados saem primeiro. Apagar um ainda não sincronizado gera `CLIP_EVICTED`.
- Nuvem e mock: teto `CLOUD_MAX_BYTES` no bucket/prefixo ou em `mock-s3/`.
- `SyncService` pausa upload sem conectividade (`SYNC_CONNECTIVITY_URL`) e retoma depois. Estado em `runtime/sync-state.json`.
- Provedor novo implementa `ClipStorage.upload` / `delete` e entra em `createClipStorage`.

## Interface

A interface abre numa tela de login simples: nome do produto, usuário, senha e Entrar. Sessão válida libera as abas Live, Vídeos e Gestão de equipamento, mostra o usuário no topo e oferece Sair. Credencial inválida permanece na tela de login. Em desenvolvimento os campos iniciam com `admin` / `admin`.

A aba Live mostra um cartão por câmera visível. O JPEG da visualização tem no máximo `PREVIEW_WIDTH` (padrão 480) e atualiza a cada `PREVIEW_INTERVAL_SECONDS` (padrão 2 segundos). A resolução do clipe continua `VIDEO_WIDTH` por `VIDEO_HEIGHT`; o arquivo guarda `VIDEO_OUTPUT_FPS` quadros por segundo (padrão 15). Lista de gravações com download, exclusão local/nuvem/ambos e retry de upload.

A aba Saúde mostra CPU, carga, memória, disco das gravações, temperatura e o limite de alimentação do Raspberry. Atualiza a cada 5 segundos. Na Live, um aviso aparece quando algum desses sinais passa do limite.

API autenticada: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/config`, `GET /api/snapshot`, `GET /api/preview-frame`, `GET /api/live-view`, `GET /api/health`, `GET /api/recordings`, `DELETE /api/recordings`, `GET /api/recordings/:nome`, `GET /api/events`, `POST /api/trigger`, `POST /api/clips/:id/retry`, `GET/PUT /api/equipment`, `GET /api/equipment/discovery`, `POST /api/equipment/validate-gpio`.

## Documentos desencontrados

Preferir este arquivo e o código quando um guia antigo divergir:

- `docs/architecture.md` e `docs/windows-development.md` ainda dizem que o mock guarda os 5 clipes mais recentes. `createClipStorage` aplica `CLOUD_MAX_BYTES`.
