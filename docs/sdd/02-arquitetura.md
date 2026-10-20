# Arquitetura para evoluções

Resumo do que uma spec precisa respeitar. O desenho completo está em [../architecture.md](../architecture.md).

## Portas

`ClipRecorderApplication` recebe câmera, gatilho, buffer, montador de clipe, armazenamento e logger. Evolução de negócio entra nesse fluxo ou numa porta nova. Acesso a GPIO, DirectShow, v4l2, Electron ou AWS fica no adaptador.

| Porta | Contrato mínimo |
| --- | --- |
| `SegmentingCamera` | `start` / `stop`, segmentos completos, status, erro |
| `TriggerButton` | `start` / `stop`, `onPress` |
| `VideoBufferPort` | incluir segmento, consultar intervalo, esperar um instante, duração disponível |
| `VideoClipBuilder` | juntar segmentos num MP4 |
| `ClipStorage` | `upload`, `delete` |
| `Logger` | `info` / `warn` / `error` com nome de evento |

## Processos que não se bloqueiam

- FFmpeg da câmera de gravação é processo próprio. Cada câmera extra da aba Live tem outro FFmpeg, só de JPEG, e não entra no buffer do clipe.
- Montar o clipe não envia o arquivo.
- A fila serializa uploads.
- Retenção de disco roda à parte e pode remover arquivo local; o estado em memória acompanha via `forgetClipFiles`.

Uma evolução que precise de trabalho longo (transcodificar, analisar imagem, falar com rede) descreve em que fila isso entra para a captura continuar.

## Duas superfícies, um domínio

`apps/server` é o caminho do Pi e de `npm start`. `apps/desktop` (Electron) é o caminho Windows de desenvolvimento. Os dois usam os mesmos pacotes e a UI React. Comportamento novo de operador vale para a API HTTP e para o IPC, com o mesmo `DesktopApi`.

## Configuração e segredos

Variável de ambiente é lida em `packages/config`. Exemplos em `.env.example` e, se o Pi precisar de padrão diferente, em `deploy/raspberry-pi/env.example`. Senha, chave AWS e token não aparecem em log, spec versionada nem resposta de API.

## Verificação

- Regra pura de buffer, fila, retenção, sync ou config: teste Vitest no pacote.
- Rota ou equipamento: dizer na spec como observar (chamada HTTP, estado SSE, arquivo em `runtime/`).
- Câmera real, GPIO e Pi: a spec marca o que é ensaio de campo e o que o teste automatizado cobre.
