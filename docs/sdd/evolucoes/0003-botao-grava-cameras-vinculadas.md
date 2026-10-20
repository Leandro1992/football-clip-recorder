# 0003 — Um botão grava todas as câmeras vinculadas

- Status: concluida
- Data: 2026-10-20
- Relacionada a: [0002-cameras-vinculadas-na-visualizacao.md](0002-cameras-vinculadas-na-visualizacao.md)

## Problema

Com duas câmeras na Live, a primeira fica em erro e o botão não gera clipe. A gravação abre o dispositivo da câmera principal e o preview abre o mesmo dispositivo de novo (`Device or resource busy`). O gatilho só olha essa câmera com falha, então a câmera que está na imagem também não registra.

No equipamento, os dois botões de catálogo usam o GPIO 17. Um aperto físico precisa valer para as câmeras dos dois vínculos. A mesma regra vale quando um único botão lista as duas câmeras.

## Resultado

Cada câmera ativa vinculada a um botão ativo é aberta uma vez, com imagem e buffer. Ao apertar o botão, cada câmera vinculada gera um clipe e entra na fila de upload. A falha de uma câmera não impede a outra.

## Fora de escopo

- Áudio em todas as câmeras ao mesmo tempo. O microfone fica na primeira câmera vinculada; as outras gravam só vídeo.
- Troca de dispositivo sem reiniciar o serviço. Um dispositivo novo passa a gravar depois do restart. Mudar o vínculo de um botão para câmeras que já estão abertas vale no próximo aperto.

## Comportamento

1. Dado duas câmeras ativas ligadas a botões ativos, quando o serviço sobe, então cada dispositivo tem um único FFmpeg, com segmentos e JPEG.
2. Dado um botão lista as duas câmeras, quando ele é pressionado, então nascem dois clipes, um de cada buffer, e os dois seguem para o upload.
3. Dado dois botões ativos no mesmo pino GPIO, quando esse pino é pressionado, então as câmeras de todos esses botões registram.
4. Dado uma câmera não abre, quando o botão é pressionado, então a outra câmera ainda registra e a falha aparece no cartão da câmera que não abriu.
5. O botão Registrar lance da interface dispara todas as câmeras que estão na Live.

## Critérios de aceite

- [x] Não há dois processos no mesmo `/dev/videoX`.
- [x] Um botão com duas câmeras gera dois clipes e duas entradas na fila.
- [x] Dois botões no mesmo GPIO disparam a união das câmeras.
- [x] Teste cobre a escolha das câmeras por botão e por pino.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Vários gravadores e id de clipe único por câmera |
| Câmera / hardware | Um FFmpeg por câmera vinculada; um `gpiomon` por pino |
| Armazenamento e sync | Cada clipe sobe pela fila |
| Configuração (`.env`) | Nenhuma variável nova |
| API e UI | O gatilho da Live dispara todas as câmeras visíveis |
| Raspberry Pi / Windows | O servidor headless passa a gravar as câmeras do cadastro |

## Restrições

Duas capturas 720p no Pi 4 usam mais CPU. O microfone não pode ser aberto pelas duas.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste Vitest dos vínculos. No equipamento, as duas câmeras mostram imagem e um aperto no GPIO 17 gera dois clipes.

## Notas de implementação

O servidor sobe uma pipeline completa por câmera vinculada e não abre um segundo FFmpeg de preview. `RecordingFleet` dispara cada câmera do botão, ou a união das câmeras dos botões ativos no mesmo pino. O id do clipe inclui a câmera. O Electron de desenvolvimento no Windows continua com uma câmera de gravação.
