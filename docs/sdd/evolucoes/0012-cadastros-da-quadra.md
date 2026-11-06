# 0012 — Cadastros da quadra

- Status: concluida
- Data: 2026-11-05
- Relacionada a: [0010-quadras.md](0010-quadras.md)

## Problema

Câmera, botão e Cloudflare nascem dentro da quadra. Quem leva o aparelho a outro lugar não reaproveita um bucket ou um botão já cadastrado, e a tela mistura o catálogo com a quadra em uso.

## Resultado

O operador cadastra câmeras, buckets e botões em separado e, ao criar a quadra, associa esses itens. Uma quadra pode ter várias câmeras.

## Fora de escopo

- Mais de uma quadra gravando ao mesmo tempo.
- Trocar a quadra em uso sem reiniciar o serviço.
- Conta de jogador ou de time.

## Comportamento

1. Dado o operador autenticado em Cadastro, quando ele cria uma câmera, um bucket ou um botão, então o item fica no catálogo e ainda não grava sozinho.
2. Dado câmeras, um bucket e botões já cadastrados, quando ele salva uma quadra, então a quadra guarda o nome, uma ou mais câmeras, um bucket e um ou mais botões.
3. Dado a quadra sem câmera, sem bucket ou sem botão, quando ele tenta salvar, então a quadra não é gravada e a tela explica o que falta.
4. Dado a quadra em uso, quando um botão associado é pressionado, então cada câmera ativa associada à quadra gera um clipe. O envio usa o bucket associado a essa quadra.
5. Dado um aparelho que já tinha câmeras e botões dentro da quadra, quando a configuração é lida, então esses itens passam para o catálogo e a quadra continua associada a eles.
6. Dado o formulário do bucket, quando o operador vê a access key e o secret, então os dois aparecem em texto, porque a tela só abre depois do login. O secret não entra no log.

## Critérios de aceite

- [x] Câmera, bucket e botão existem fora da quadra e têm teste de migração.
- [x] A quadra só salva com ao menos uma câmera, um bucket e um botão.
- [x] A mesma quadra aceita mais de uma câmera.
- [x] Access key e secret aparecem no formulário do bucket.
- [x] O clipe da quadra em uso continua indo para o bucket associado a ela.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Catálogo separado e a quadra só com os ids associados |
| Câmera / hardware | Nenhuma mudança de captura |
| Armazenamento e sync | O upload lê o bucket associado à quadra do clipe |
| Configuração (`.env`) | Nenhuma variável nova. O `.env` segue o destino quando o bucket está incompleto |
| API e UI | Cadastro em quatro blocos. Ajustes não guarda mais o Cloudflare |
| Raspberry Pi / Windows | A mesma tela |

## Restrições

A troca da quadra em uso, ou uma câmera nova, passa a gravar depois de reiniciar o serviço. Cada botão associado grava todas as câmeras ativas daquela quadra.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste da migração. Na tela, criar câmera, bucket e botão, salvar uma quadra com duas câmeras e ver a key no formulário.

## Notas de implementação

A quadra guarda só os ids. O catálogo da quadra em uso monta o vínculo: cada botão associado grava todas as câmeras ativas daquela quadra. Um arquivo antigo, com câmeras dentro da quadra, vira catálogo na leitura.
