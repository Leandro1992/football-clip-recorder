# SDD — Olho no lance

Especificação do produto e das evoluções. O código implementa o que está em [01-estado-atual.md](01-estado-atual.md) mais as evoluções com status `concluida`. Trabalho novo entra como evolução antes de virar código.

## Mapa

| Arquivo | Função |
| --- | --- |
| [00-produto.md](00-produto.md) | Para quem é, o que o sistema promete, restrições de campo |
| [01-estado-atual.md](01-estado-atual.md) | Comportamento que já existe. Atualizar quando uma evolução entra na base |
| [02-arquitetura.md](02-arquitetura.md) | Limites que uma evolução precisa respeitar |
| [glossario.md](glossario.md) | Vocabulário do domínio |
| [evolucoes/](evolucoes/README.md) | Uma spec por mudança de produto |
| [decisoes/](decisoes/README.md) | Decisões que continuam valendo depois da evolução |

Guias operacionais continuam em `docs/windows-development.md`, `docs/raspberry-pi-port.md` e `docs/storage-and-sync.md`.

## Ciclo de uma evolução

1. Copie [evolucoes/_template.md](evolucoes/_template.md) para `evolucoes/NNNN-slug.md`. `NNNN` é o próximo número de quatro dígitos.
2. Preencha problema, comportamento, critérios de aceite e impacto. Deixe em branco o que ainda não foi decidido, na seção de perguntas.
3. Status inicial: `rascunho`.
4. Inclua uma linha no [índice](evolucoes/README.md).
5. Quando o comportamento estiver fechado, mude para `pronta`.
6. A implementação segue a spec. Status passa a `em-andamento` e, no fim, `concluida`.
7. Se a base do produto mudou, atualize [01-estado-atual.md](01-estado-atual.md).
8. Se a evolução fixou uma restrição permanente, registre em [decisoes/](decisoes/README.md).

Status possíveis: `rascunho`, `pronta`, `em-andamento`, `concluida`, `descartada`.

Uma spec `rascunho` ainda pode mudar. Agente de código implementa spec `pronta`, ou um pedido que nomeia o arquivo da evolução.

## O que cabe numa evolução

Cabe: comportamento observável pelo operador, pelo hardware ou por quem consome os clipes.

Fica de fora da spec e entra só na implementação: nome de função, escolha de biblioteca interna, formato de um teste. A spec cita pacote ou rota quando o encaixe no sistema atual importa.
