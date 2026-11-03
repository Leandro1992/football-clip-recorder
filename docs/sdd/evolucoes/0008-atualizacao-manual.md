# 0008 — Atualização manual pela interface

- Status: concluida
- Data: 2026-11-03
- Relacionada a: [0007-rede-direta-do-aparelho.md](0007-rede-direta-do-aparelho.md)

## Problema

Quem opera o aparelho na quadra precisa levar uma nova versão da `main` sem um computador ligado no SSH. Uma atualização sozinha, de tempos em tempos, compila e reinicia no meio do jogo.

## Resultado

Ao abrir a aba Controle de versão, a pessoa vê se a `main` tem algo diferente e, quando tem, aperta um botão para atualizar.

## Fora de escopo

- Agendamento que atualiza sem alguém apertar o botão.
- Escolher outro branch, reverter um commit ou editar o Git.
- Atualizar o Windows de desenvolvimento por essa aba.

## Comportamento

1. Dado o operador autenticado abre a aba Controle de versão no Raspberry, quando a tela consulta a `main`, então mostra o commit deste aparelho e o commit da `main`.
2. Dado a `main` está à frente e o aparelho não tem commit local, quando a consulta termina, então o botão de atualizar fica disponível.
3. Dado o aparelho já está na `main`, ou a história divergiu, quando a consulta termina, então o botão fica indisponível e a tela explica o motivo.
4. Dado o botão disponível, quando o operador confirma, então a compilação e a reinicialização começam fora do processo da câmera. A câmera para só na troca final, por alguns segundos.
5. Dado a atualização derruba a página, quando o serviço volta, então a aba passa a mostrar o commit novo.
6. Dado o Windows de desenvolvimento, quando a aba abre, então a tela explica que a atualização pela interface existe no Raspberry.

## Critérios de aceite

- [x] A comparação entre o aparelho e a `main` é determinística e tem teste.
- [x] Mensagem de erro do Git não devolve senha nem token que esteja no endereço.
- [x] A API autenticada `GET /api/version` e `POST /api/version` existe. Sem sessão, responde 401.
- [x] A aba Controle de versão só libera o botão quando a `main` tem commits novos que cabem num avanço simples.
- [x] O manual de campo descreve o botão.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Consulta ao Git e disparo do script de atualização |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | Nenhuma variável nova. O diretório do app fica em `/etc/olho-no-lance/update.env` |
| API e UI | `GET/POST /api/version` e a aba Controle de versão |
| Raspberry Pi / Windows | O botão só dispara o deploy no Pi. No Windows a aba explica isso |

## Restrições

A compilação usa CPU enquanto a câmera continua. A reinicialização interrompe a captura por alguns segundos. Por isso o passo só acontece quando alguém aperta o botão.

## Perguntas em aberto

- Nenhuma.

## Verificação

Teste Vitest da comparação e da redação do erro. No equipamento, a aba mostra o commit atual e o botão só aparece quando a `main` está à frente.

## Notas de implementação

A consulta roda só ao abrir a aba. Não há temporizador. O botão chama `sudo -n /usr/local/sbin/olho-update`, que abre um serviço separado (`systemd-run --unit=olho-update`). Esse serviço baixa a `main`, compila como o usuário do app e só então reinicia a câmera. No Windows a aba não chama o Git.
