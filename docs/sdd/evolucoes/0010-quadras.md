# 0010 — Quadras no aparelho portátil

- Status: concluida
- Data: 2026-11-03

## Problema

O mesmo aparelho vai a mais de uma quadra. Os vídeos e o destino na nuvem ficam misturados, sem dizer de qual quadra e de qual câmera saiu o lance.

## Resultado

O operador cadastra quadras. Cada quadra tem câmeras, cada câmera tem um botão, e os vídeos dessa quadra sobem para o Cloudflare configurado nela. O nome do arquivo identifica a quadra, a câmera e o horário.

## Fora de escopo

- Conta de jogador, time ou campeonato.
- Trocar a quadra em uso sem reiniciar o serviço.
- Mais de uma quadra gravando ao mesmo tempo.

## Comportamento

1. Dado o operador autenticado na Gestão de equipamento, quando ele cadastra uma quadra, então ela guarda id, nome, câmeras, botões e o destino Cloudflare (endereço, bucket, região, access key e secret).
2. Dado várias quadras, quando uma está em uso, então só as câmeras e os botões dessa quadra gravam. As outras ficam guardadas.
3. Dado uma câmera da quadra em uso com botão vinculado, quando o botão é pressionado, então o arquivo do clipe começa com o nome da quadra, o nome da câmera e o horário local do registro.
4. Dado a quadra em uso com Cloudflare preenchido, quando o clipe fica pronto, então o envio usa o destino dessa quadra, sem interromper a captura.
5. Dado um clipe já gerado, quando a quadra em uso muda, então esse clipe continua indo para o Cloudflare da quadra em que foi gravado.
6. Dado a quadra sem Cloudflare completo, quando o clipe fica pronto, então ele permanece no aparelho e o envio usa a configuração geral do `.env`, se houver.
7. Dado um aparelho que já tinha câmeras e botões sem quadra, quando a configuração é lida, então esses itens passam a pertencer a uma quadra principal.

## Critérios de aceite

- [x] O nome do arquivo é determinístico e tem teste.
- [x] Uma configuração antiga sem quadras vira uma quadra sem perder câmera nem botão.
- [x] A Gestão de equipamento cadastra a quadra, as câmeras, o botão de cada câmera e o Cloudflare, em português.
- [x] O segredo do Cloudflare não entra no log.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Quadra, nome do clipe e o id da quadra no clipe |
| Câmera / hardware | Nenhuma mudança de captura. A quadra em uso escolhe quais câmeras abrem |
| Armazenamento e sync | O upload escolhe o Cloudflare da quadra do clipe |
| Configuração (`.env`) | Nenhuma variável nova. O `.env` continua o destino quando a quadra não tem Cloudflare |
| API e UI | `GET/PUT /api/equipment` passa a gravar quadras |
| Raspberry Pi / Windows | A mesma gestão nos dois |

## Restrições

A troca da quadra em uso, ou uma câmera nova, passa a gravar depois de reiniciar o serviço. O segredo fica no `equipment-config.json` do aparelho, só para o operador autenticado.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste do nome do arquivo e da migração. Na gestão, criar uma quadra, ver o prefixo descrito e o bloco de Cloudflare.

## Notas de implementação

A quadra em uso escolhe as câmeras que abrem na subida do serviço. Se o arquivo ainda não tem quadras, a subida grava a quadra principal com as câmeras e os botões atuais. O nome do arquivo é `quadra__camera__aaaammdd-hhmmss__id-da-quadra`. O upload lê o id da quadra no clipe e abre o cliente S3 daquela quadra. Secret em branco na gravação conserva o secret anterior.
