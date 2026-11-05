# 0011 — Interface de campo

- Status: concluida
- Data: 2026-11-04
- Relacionada a: [0010-quadras.md](0010-quadras.md)

## Problema

Quem opera o aparelho está na quadra, com o celular na mão. A interface abre seis abas, esconde o botão de gravar abaixo da imagem e da lista, e pede Cloudflare, GPIO e caminho de dispositivo no mesmo formulário em que se escolhe a câmera.

## Resultado

O operador vê a câmera, registra o lance e encontra câmera, botão e quadra sem atravessar ajuste de rede, saúde ou versão.

## Fora de escopo

- Mudar captura, nome do arquivo, fila de upload ou o modelo de quadra.
- Tema escuro.
- Conta de jogador ou de time.

## Comportamento

1. Dado o operador autenticado no celular, quando a interface abre, então ele vê Jogo, com a imagem da câmera e o botão Registrar lance alcançável sem rolar a página inteira, e a navegação Jogo, Lances, Quadra e Ajustes fixa na base.
2. Dado a mesma interface numa tela larga, quando ela abre, então os quatro destinos ficam no topo e o botão de lance continua junto da imagem.
3. Dado uma câmera com imagem, quando o operador olha o Jogo, então vê o quadro inteiro, o nome da quadra em uso e uma frase de estado em português.
4. Dado um ou mais lances gravados, quando o operador abre Lances, então cada vídeo é um cartão com quadra, câmera, horário e o estado do envio, com Abrir e Reenviar no próprio cartão.
5. Dado a quadra em uso, quando o operador abre Quadra, então escolhe a quadra, liga ou desliga cada câmera e marca qual botão grava aquela câmera. Salvar continua necessário para guardar.
6. Dado um ajuste que não é do lance, quando o operador abre Ajustes, então encontra envio da quadra em uso, rede, saúde e atualização, cada um na própria tela.
7. Dado a saúde fora do normal, quando o operador está no Jogo, então vê uma frase de aviso. O detalhe continua em Ajustes.

## Critérios de aceite

- [x] No celular, a navegação tem quatro destinos e fica na base.
- [x] Registrar lance aparece junto da imagem, com alvo de toque de pelo menos 48 px.
- [x] A imagem da câmera mostra o quadro inteiro.
- [x] Lances não usam tabela.
- [x] Cloudflare, rede, saúde e atualização não ocupam a tela da quadra.
- [x] O vínculo de botão e câmera continua o mesmo: o botão grava as câmeras marcadas.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Nenhuma |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | Nenhuma |
| API e UI | Quatro destinos, cartões e o design system em `docs/sdd/03-design-system.md` |
| Raspberry Pi / Windows | A mesma interface |

## Restrições

A rede do aparelho pode não ter internet. A interface não depende de fonte baixada. O JPEG de visualização continua limitado por `PREVIEW_WIDTH` e `PREVIEW_INTERVAL_SECONDS`.

## Perguntas em aberto

- Nenhuma.

## Verificação

No celular e numa tela larga: entrar, registrar a posição do botão de lance, abrir um lance em cartão, marcar o botão de uma câmera e achar a rede dentro de Ajustes.

## Notas de implementação

Quatro destinos. No celular a barra é fixa; a partir de 900 px ela fica no topo. O botão de lance tem 48 px e permanece na primeira tela junto da imagem. O vínculo continua botão para câmeras, mostrado em cada câmera como “Grava com”.
