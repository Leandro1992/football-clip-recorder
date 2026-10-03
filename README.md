# Football Clip Recorder

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
docs/          arquitetura e guias por plataforma
```

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
| `BUTTON_PROVIDER` | `virtual` (só UI) ou `gpio` | `virtual` |
| `GPIO_CHIP` / `GPIO_BUTTON_PIN` | Chip e linha do botão (obrigatório se `gpio`) | `gpiochip0` / |
| `GPIO_ACTIVE_LOW` / `GPIO_DEBOUNCE_MS` | Polaridade e debounce | `true` / `50` |

No modo `mock`, os clipes vão para `mock-s3/` e apenas os **5 mais recentes** são mantidos (aqui e em `runtime/clips/`).

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
journalctl -u football-clip-recorder -f          # logs
sudo systemctl restart football-clip-recorder    # após editar o .env
v4l2-ctl --list-devices                          # câmeras
arecord -l                                       # microfones (card/device -> plughw:C,D)
```

Detalhes (GPIO, áudio, desempenho): [docs/raspberry-pi-port.md](docs/raspberry-pi-port.md).

## Desenvolvimento

```bash
npm run build
npm run lint
npm test
```

## API do servidor

`GET /api/snapshot`, `GET /api/preview-frame`, `GET /api/recordings`, `GET /api/recordings/:nome` (suporta Range, `?download`), `GET /api/events` (SSE), `POST /api/trigger`, `POST /api/clips/:id/retry`.

> A interface web **não tem autenticação**. Use apenas em rede local confiável.
