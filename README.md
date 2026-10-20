# Olho no lance (Football Clip Recorder)

Grava continuamente uma câmera USB em segmentos curtos de vídeo, mantém um buffer circular e, quando o botão é acionado, gera um clipe MP4 (últimos N segundos + alguns segundos pós-evento) e envia ao armazenamento (local/mock ou AWS S3).

Funciona em dois modos:

| Plataforma | Interface | Como usar |
| --- | --- | --- |
| **Windows** | App desktop (Electron) ou servidor web | `npm run dev` ou `npm start` |
| **Raspberry Pi (Linux)** | Servidor web headless | `http://<ip-do-pi>:3000` pelo navegador |

## Estrutura

```
apps/desktop   UI React (+ Electron no Windows)
apps/server    Servidor Node headless (HTTP + SSE) que serve a UI
packages/      config, core, video, camera, hardware, storage
deploy/        scripts e serviço systemd para o Raspberry Pi
docs/          arquitetura, guias por plataforma e SDD
```

## Especificação

O comportamento de base e as próximas evoluções ficam no [SDD](docs/sdd/README.md). Contexto para agentes de código: [AGENTS.md](AGENTS.md).

## Requisitos

- Node.js 20+
- FFmpeg
- Câmera USB (microfone USB opcional)

## Configuração (`.env`)

Copie `.env.example` para `.env` e ajuste. Principais variáveis:

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `PORT` / `HOST` | Porta/endereço do servidor web | `3000` / `0.0.0.0` |
| `FFMPEG_PATH` | Caminho do ffmpeg (vazio = procura no PATH) | |
| `CAMERA_DEVICE` | Nome (Windows) ou `/dev/videoX` (Linux). Vazio = autodetecta | |
| `ENABLE_AUDIO` / `AUDIO_DEVICE` | Gravar áudio e dispositivo (Linux: `plughw:C,D`) | `false` |
| `AUDIO_GAIN_DB` | Ganho de áudio em dB (com limitador) | `0` |
| `AUDIO_DENOISE` | Filtro de ruído (passa-altas + `afftdn`) | `false` |
| `VIDEO_WIDTH/HEIGHT/FPS/FORMAT` | Captura | `1920x1080@30`, `mjpeg` |
| `BUFFER_DURATION_SECONDS` | Janela do buffer | `30` |
| `POST_EVENT_DURATION_SECONDS` | Gravação após o gatilho | `3` |
| `SEGMENT_DURATION_SECONDS` | Duração de cada segmento | `1` |
| `STORAGE_PROVIDER` | `mock` ou `s3` | `mock` |
| `AWS_REGION` / `AWS_S3_BUCKET` | Para `s3` (credenciais pelo SDK padrão da AWS) | |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Login da interface web | `admin` / `admin` |
| `BUTTON_PROVIDER` | `virtual` (só UI) ou `gpio` | `virtual` |
| `GPIO_CHIP` / `GPIO_BUTTON_PIN` | Chip e linha do botão (obrigatório se `gpio`) | `gpiochip0` / |
| `GPIO_ACTIVE_LOW` / `GPIO_DEBOUNCE_MS` | Polaridade e debounce | `true` / `50` |
| `EQUIPMENT_MAIN_CAMERA_*` | ID/nome da câmera principal pré-cadastrada na UI | `env-camera-main` / `Camera principal` |
| `EQUIPMENT_MAIN_BUTTON_*` | ID/nome do botão principal pré-cadastrado na UI | `env-button-main` / `Botao principal` |
| `STORAGE_MAX_BYTES` | Limite máximo local para clipes | `10737418240` (10GB) |
| `CLOUD_MAX_BYTES` | Limite máximo no armazenamento S3/R2 | `10737418240` (10GB) |

No modo `mock`, os clipes vão para `mock-s3/` e o limite também respeita `CLOUD_MAX_BYTES`.

A aba **Gestão de equipamento** sempre começa com câmera e botão principais vindos do `.env`
(camera/dispositivo atual e botão atual), para manter a configuração centralizada.

## Windows

```powershell
winget install Gyan.FFmpeg      # se ainda não tiver
npm install
copy .env.example .env          # ajuste CAMERA_DEVICE, etc.
npm run camera:list             # lista câmeras e microfones (DirectShow)
```

App desktop (Electron):

```powershell
npm run dev
```

Ou servidor web (sem Electron):

```powershell
npm run build
npm start                       # http://localhost:3000
```

Detalhes: [docs/windows-development.md](docs/windows-development.md).

## Raspberry Pi

Testado em Raspberry Pi 4 (Raspberry Pi OS / Debian 13) com câmera e microfone USB.

```bash
git clone <url-do-repositorio> && cd football-clip-recorder
bash deploy/raspberry-pi/setup.sh
```

O script instala ffmpeg, v4l-utils, alsa-utils, gpiod e Node 20, cria o `.env` a partir de `deploy/raspberry-pi/env.example`, compila e registra o serviço systemd `football-clip-recorder` (inicia no boot). Depois acesse `http://<ip-do-pi>:3000` de qualquer dispositivo da rede.

```bash
bash deploy/raspberry-pi/update.sh               # atualizar (git pull + build + restart)
journalctl -u football-clip-recorder -f          # logs
sudo systemctl restart football-clip-recorder    # após editar o .env
v4l2-ctl --list-devices                          # câmeras
arecord -l                                       # microfones (card/device -> plughw:C,D)
```

Detalhes (GPIO, áudio, desempenho): [docs/raspberry-pi-port.md](docs/raspberry-pi-port.md).

## Armazenamento e sincronização

Clipes usam até 50% do espaço livre do disco (`STORAGE_MAX_PERCENT_FREE`), apagando os mais antigos; uploads pausam sem internet e retomam ao reconectar. Detalhes e sugestão de nuvem (Cloudflare R2): [docs/storage-and-sync.md](docs/storage-and-sync.md).

## Desenvolvimento

```bash
npm run build
npm run lint
npm test
```

## API do servidor

`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/config`, `GET /api/snapshot`, `GET /api/preview-frame`, `GET /api/live-view`, `GET /api/recordings`, `DELETE /api/recordings`, `GET /api/recordings/:nome` (suporta Range, `?download`), `GET /api/events` (SSE), `POST /api/trigger`, `POST /api/clips/:id/retry`, `GET/PUT /api/equipment`, `GET /api/equipment/discovery`, `POST /api/equipment/validate-gpio`.

A interface abre numa tela de login simples (usuário e senha) antes das abas. Troque `AUTH_USERNAME` e `AUTH_PASSWORD` no `.env` em produção.
