# 0002 — Câmeras vinculadas na visualização

- Status: concluida
- Data: 2026-10-20
- Relacionada a: nenhuma

## Problema

O cadastro aceita várias câmeras e vínculos com botões, mas a aba Live mostra só a imagem da pipeline única. Uma câmera nova, mesmo ligada a um botão virtual ou físico, não aparece para o operador conferir o enquadramento.

## Resultado

Depois de salvar, cada câmera ativa vinculada a um botão ativo aparece na aba Live, com o nome, os botões e a imagem daquele dispositivo.

## Fora de escopo

- Gravar clipe, buffer ou áudio por câmera extra. O lance continua saindo da câmera configurada no `.env`.
- O botão físico passar a escolher qual câmera entra no clipe.
- Abrir de novo um dispositivo que a pipeline de gravação já está usando.
- Aplicar botão GPIO novo sem reiniciar o serviço.

## Comportamento

1. Dado a pipeline de gravação em execução, quando o operador abre Live, então vê ao menos o cartão dessa câmera, com a pré-visualização que o FFmpeg de captura já escreve.
2. Dado uma câmera ativa vinculada a um botão ativo, virtual ou GPIO, quando a configuração é salva, então a aba Live mostra um cartão com o nome da câmera e o nome do botão.
3. Dado o dispositivo dessa câmera é outro, diferente do que já grava, então um FFmpeg só de preview (JPEG, cerca de 1 fps, sem áudio e sem segmentos) alimenta o cartão.
4. Dado o dispositivo é o mesmo da gravação, ou é o placeholder de desenvolvimento (`default` ou `/dev/video0` no Windows quando a câmera real tem outro nome), então não abre um segundo processo: o cartão da gravação absorve o nome e os botões.
5. Dado a câmera está inativa, sem vínculo, ou o único botão vinculado está inativo, então ela não entra na Live.
6. Dado o operador remove o vínculo e salva, então o cartão some e o processo de preview daquele dispositivo para.
7. Dado o dispositivo extra não abre, então o cartão mostra a falha e as outras câmeras continuam.
8. O botão Registrar lance continua único e dispara a pipeline de gravação.

A visualização usa a configuração salva. Mudança ainda não salva não abre câmera.

## Critérios de aceite

- [x] Câmera ativa com botão virtual ativo aparece na Live depois de salvar.
- [x] Câmera ativa com botão GPIO ativo aparece na Live depois de salvar.
- [x] Câmera sem vínculo não aparece como cartão extra.
- [x] Câmera inativa ou botão inativo não entra.
- [x] O mesmo dispositivo da gravação não é aberto duas vezes.
- [x] A API `GET /api/live-view` e o IPC equivalente devolvem os cartões.
- [x] Teste cobre a escolha dos cartões e o comando de preview sem o muxer de segmentos.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhum fluxo de clipe |
| Câmera / hardware | Processo de preview por dispositivo extra |
| Armazenamento e sync | Nenhum |
| Configuração (`.env`) | Nenhuma variável nova |
| API e UI | `GET /api/live-view` e grade na aba Live |
| Raspberry Pi / Windows | Os dois caminhos sobem e descem os previews ao salvar |

## Restrições

Cada preview extra compete por CPU e por uma câmera USB. No Pi 4 isso pesa; o preview não codifica o buffer em H.264. GPIO novo continua exigindo reinício.

## Perguntas em aberto

- Nenhuma para esta entrega.

## Verificação

Teste Vitest da seleção de cartões e dos argumentos FFmpeg. Na interface, login, cadastro de uma câmera, vínculo com botão virtual, salvar e conferir o cartão na aba Live.

## Notas de implementação

`selectLinkedCameras` e `buildLiveCameraCards` decidem os cartões. `LivePreviewHub` sobe um `PreviewCapture` por dispositivo extra e reutiliza o JPEG da gravação no cartão principal. Servidor e Electron chamam `sync` na subida e ao salvar o equipamento. A UI consulta `getLiveView` uma vez por segundo enquanto a aba Live está aberta.
