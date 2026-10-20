# 0001 — Tela de login simples

- Status: concluida
- Data: 2026-10-20
- Relacionada a: nenhuma

## Problema

O operador abre a interface e os guias ainda diziam que não havia autenticação. A tela de login já existia no código, mas a documentação de campo não descrevia o que a pessoa vê.

## Resultado

Antes das abas, a interface pede usuário e senha numa tela simples. A documentação de produto e de instalação descreve essa tela.

## Fora de escopo

- Conta por jogador, time ou campeonato.
- Trocar o mecanismo de sessão, a duração ou as variáveis `AUTH_USERNAME` / `AUTH_PASSWORD`.

## Comportamento

1. Dado que não há sessão, quando a pessoa abre a interface, então vê o nome Olho no lance, usuário, senha e o botão Entrar.
2. Dado usuário e senha iguais aos do `.env`, quando ela entra, então as abas Live, Vídeos e Gestão de equipamento ficam disponíveis e o nome do usuário aparece no topo.
3. Dado credencial errada, quando ela entra, então a tela permanece e mostra a falha.
4. Dado uma sessão aberta, quando ela escolhe Sair, então volta para a tela de login.
5. Dado uma chamada de API sem sessão, então a resposta é 401.

Em desenvolvimento os campos iniciam com `admin` / `admin`, o mesmo padrão do `.env`. Em produção esses valores precisam ser trocados.

## Critérios de aceite

- [x] A tela de login está descrita em `docs/sdd/01-estado-atual.md`, no README, no guia do Windows e no guia do Raspberry Pi.
- [x] O guia do Pi não afirma mais que a interface é aberta.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Nenhuma |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | Nenhuma variável nova |
| API e UI | Nenhuma mudança de comportamento; a tela já existia |
| Raspberry Pi / Windows | Texto dos guias |

## Restrições

A senha é única do equipamento e trafega na rede local. Continua adequado só para rede confiável.

## Perguntas em aberto

- Nenhuma.

## Verificação

Leitura dos guias e confronto com a tela em `apps/desktop/src/App.tsx`.

## Notas de implementação

A tela, o cookie de sessão e o bloqueio das rotas `/api/*` já estavam no servidor e no Electron. Esta evolução só alinhou a documentação.
