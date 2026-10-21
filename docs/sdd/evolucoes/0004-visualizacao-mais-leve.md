# 0004 — Visualização mais leve

- Status: concluida
- Data: 2026-10-21
- Relacionada a: [0003-botao-grava-cameras-vinculadas.md](0003-botao-grava-cameras-vinculadas.md)

## Problema

No Raspberry, as duas câmeras em 720p a 30 quadros por segundo deixam a carga acima do número de núcleos. O FFmpeg repete o mesmo quadro milhões de vezes. A imagem do navegador sai desse mesmo processo, então a câmera 2 aparece travada e, em alguns momentos, parece falhar.

## Resultado

A aba Live mostra uma imagem menor e atualiza com mais intervalo. A resolução do lance gravado permanece a da câmera.

## Fora de escopo

- Baixar a resolução do clipe.
- Abrir um segundo FFmpeg só para a visualização. O mesmo dispositivo não pode ser aberto duas vezes.

## Comportamento

1. Dado a aba Live aberta, quando a imagem atualiza, então ela tem no máximo `PREVIEW_WIDTH` (padrão 480) de largura e chega a cada `PREVIEW_INTERVAL_SECONDS` (padrão 2).
2. Dado um JPEG ainda incompleto no disco, quando a interface pede a imagem, então permanece a última imagem completa.
3. O clipe continua em `VIDEO_WIDTH` por `VIDEO_HEIGHT`. O arquivo guarda `VIDEO_OUTPUT_FPS` quadros por segundo (padrão 15), para o equipamento acompanhar a captura sem repetir o mesmo quadro.

## Critérios de aceite

- [x] A visualização não usa a resolução da gravação.
- [x] A interface espera o intervalo configurado e não empilha pedidos.
- [x] Um JPEG incompleto não substitui a última imagem boa.
- [x] O comando de gravação limita os quadros do clipe e mantém a resolução da câmera.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | JPEG menor e mais lento; clipe em menos quadros por segundo |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | `PREVIEW_WIDTH`, `PREVIEW_INTERVAL_SECONDS`, `VIDEO_OUTPUT_FPS` |
| API e UI | A Live informa o intervalo e a largura da imagem |
| Raspberry Pi / Windows | O mesmo comando de câmera |

## Restrições

Duas capturas 720p no Pi 4. A visualização continua no mesmo FFmpeg da gravação.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste do filtro de preview e do JPEG incompleto. No equipamento, cada FFmpeg usa `scale=480` e `-r 15`, e a imagem da câmera 2 muda de tempos em tempos.

## Notas de implementação

O padrão novo vale sem editar o `.env` do equipamento. A captura da câmera continua em `VIDEO_FPS`.
