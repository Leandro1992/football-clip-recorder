# 0005 — Saúde do hardware

- Status: concluida
- Data: 2026-10-21
- Relacionada a: [0004-visualizacao-mais-leve.md](0004-visualizacao-mais-leve.md)

## Problema

Quando a câmera trava ou o clipe falha, o operador não vê se a causa é CPU, memória, disco, temperatura ou fonte. O gargalo só aparece no log do equipamento.

## Resultado

A aba Saúde mostra o estado do equipamento e avisa na Live quando algum sinal passa do limite.

## Fora de escopo

- Desligar câmera ou reduzir qualidade automaticamente a partir desses números.
- Histórico dos sinais.

## Comportamento

1. Dado o operador autenticado na aba Saúde, quando a tela atualiza, então aparecem CPU, carga, memória, disco das gravações, temperatura e alimentação, cada um com Normal, Atenção ou Crítico.
2. Dado um sinal sem leitura neste sistema, quando a tela atualiza, então esse item aparece como não disponível e não gera alarme.
3. Dado CPU, carga, memória, disco, temperatura ou alimentação em Atenção ou Crítico, quando a aba Live está aberta, então o resumo do gargalo aparece acima das câmeras.
4. A leitura não para a captura nem o upload.

## Critérios de aceite

- [x] Os limites de CPU, memória, disco, carga, temperatura e alimentação são determinísticos e têm teste.
- [x] A API autenticada `GET /api/health` devolve a leitura.
- [x] A aba Saúde mostra os parâmetros em português.
- [x] A Live só avisa quando há gargalo.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Leitura do sistema operacional |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | Nenhuma variável nova |
| API e UI | `GET /api/health` e aba Saúde |
| Raspberry Pi / Windows | Temperatura, carga e alimentação aparecem quando o sistema informa |

## Restrições

No Windows a carga, a temperatura e a alimentação do Raspberry não existem. O disco medido é o da pasta de runtime.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste Vitest dos limites. No equipamento, a aba Saúde mostra temperatura e o aviso de carga quando o processador está acima dos núcleos.

## Notas de implementação

CPU alta a partir de 85%, crítica a partir de 95%. Memória e disco a partir de 80% e 92%. Temperatura a partir de 70 °C e 80 °C. Carga acima do número de núcleos é atenção; acima de uma vez e meia, crítica. A alimentação usa os bits do Raspberry (`get_throttled`).
