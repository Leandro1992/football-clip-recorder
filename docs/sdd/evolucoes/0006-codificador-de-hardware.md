# 0006 — Codificador de hardware sem áudio

- Status: concluida
- Data: 2026-10-28
- Relacionada a: [0004-visualizacao-mais-leve.md](0004-visualizacao-mais-leve.md)

## Problema

Com o ventilador fora, o Raspberry fica acima de 70 °C mesmo com uma câmera só. A gravação H.264 é feita pelo processador, e o filtro de áudio entra no mesmo processo.

## Resultado

No Raspberry Pi 4 o clipe usa o codificador de hardware e a captura segue sem microfone, baixando o uso do processador.

## Fora de escopo

- Trocar a resolução do clipe.
- Instalar o ventilador. Isso continua sendo a saída de ar da caixa.

## Comportamento

1. Dado `VIDEO_ENCODER=h264_v4l2m2m`, quando a câmera grava, então o FFmpeg usa o codificador de hardware e não o `libx264`.
2. Dado `ENABLE_AUDIO=false`, quando a câmera abre, então não há entrada de microfone nem filtro de áudio.
3. A resolução do clipe continua `VIDEO_WIDTH` por `VIDEO_HEIGHT`.
4. No Windows, o padrão continua `libx264`.

## Critérios de aceite

- [x] O comando de hardware não leva preset de software.
- [x] O Pi 4 gera H.264 com `h264_v4l2m2m`.
- [x] As duas câmeras podem usar o codificador de hardware ao mesmo tempo.
- [x] Com áudio desligado, o processo não abre o microfone.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Encoder selecionável e áudio opcional de fato no Linux |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | `VIDEO_ENCODER`, `VIDEO_BITRATE_KBPS` |
| API e UI | Nenhuma |
| Raspberry Pi / Windows | O Pi usa hardware; o Windows permanece em software |

## Restrições

O codificador de hardware do Pi 4 foi ensaiado com dois processos curtos ao mesmo tempo. O ventilador continua necessário no sol.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste do comando. No equipamento, o processo da câmera mostra `h264_v4l2m2m`, sem `alsa`, e a temperatura da aba Saúde desce em relação aos 74 °C.

## Notas de implementação

No equipamento, `VIDEO_ENCODER=h264_v4l2m2m` e `ENABLE_AUDIO=false`. A taxa do hardware é `VIDEO_BITRATE_KBPS` (padrão 4000).
