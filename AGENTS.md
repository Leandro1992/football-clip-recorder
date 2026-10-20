# Olho no lance — referência para agentes

Produto: hardware e software para registrar lances (gols e jogadas) em partidas amadoras. Nome de código do repositório: `football-clip-recorder`. Nome de produto na interface: **Olho no lance**.

Uma câmera USB grava segmentos curtos o tempo todo. Um botão (na interface ou GPIO) dispara a montagem de um clipe MP4 com a janela anterior ao evento mais alguns segundos depois. O clipe fica no disco e sobe para armazenamento local (mock) ou S3/R2 quando há rede.

## Leia nesta ordem

1. [docs/sdd/README.md](docs/sdd/README.md) — como especificar uma evolução.
2. [docs/sdd/01-estado-atual.md](docs/sdd/01-estado-atual.md) — o que o sistema faz hoje.
3. A evolução em `docs/sdd/evolucoes/` que o pedido cita. Sem spec `pronta`, não invente comportamento de produto.
4. [docs/architecture.md](docs/architecture.md) para o fluxo técnico. Se um doc antigo divergir do código, vale o código e o SDD.

## Mapa do repositório

| Caminho | Responsabilidade |
| --- | --- |
| `packages/core` | Orquestração do clipe, fila de upload, retenção, sincronização, tipos e portas |
| `packages/video` | Buffer circular e concatenação FFmpeg |
| `packages/camera` | Descoberta e captura USB (DirectShow no Windows, v4l2/ALSA no Linux) |
| `packages/hardware` | Botão virtual, GPIO (`gpiomon`) e composição de gatilhos |
| `packages/storage` | `ClipStorage`: mock e S3 |
| `packages/config` | Único lugar que lê `.env` |
| `apps/server` | Servidor HTTP + SSE, login, equipamento, serviço do Raspberry Pi |
| `apps/desktop` | UI React; no Windows também sobe via Electron |
| `deploy/raspberry-pi` | `setup.sh`, `update.sh`, unit systemd |
| `docs/sdd` | Especificação viva |

A lógica de negócio fica em `packages/core` e depende de portas (`Camera`, `TriggerButton`, `VideoBufferPort`, `VideoClipBuilder`, `ClipStorage`). Electron, GPIO, FFmpeg e AWS ficam nos adaptadores.

## Invariantes

- A captura não espera upload, retenção nem a UI.
- Uploads passam por `UploadQueue`. Falha mantém o MP4 local com status `pending`.
- Configuração nova entra em `packages/config` (`AppConfig` + `.env.example`). Evite `process.env` espalhado.
- Logs são JSON de uma linha: `level`, `event`, `timestamp`. Eventos por segmento já são verbose (`LOG_VERBOSE`).
- Testes Vitest ficam ao lado do código (`*.test.ts`).
- Não versione `.env`, `runtime/` nem `mock-s3/`.

## Comandos

```bash
npm run build
npm run lint
npm test
npm run dev          # Electron no Windows
npm start            # servidor em http://localhost:3000 (depois do build)
npm run camera:list
```

Node.js 20+ e FFmpeg no PATH (ou `FFMPEG_PATH`).

## Como evoluir

Copie [docs/sdd/evolucoes/_template.md](docs/sdd/evolucoes/_template.md), preencha e registre no índice. Implemente quando o status for `pronta` ou quando o pedido nomear a evolução. Ao concluir, atualize o status e, se o comportamento de base mudou, [docs/sdd/01-estado-atual.md](docs/sdd/01-estado-atual.md). Decisão durável vai para `docs/sdd/decisoes/`.
