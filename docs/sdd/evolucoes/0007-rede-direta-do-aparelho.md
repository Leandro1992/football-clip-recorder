# 0007 — Rede direta do aparelho

- Status: em-andamento
- Data: 2026-11-03
- Relacionada a: [0001-tela-de-login.md](0001-tela-de-login.md)

## Problema

Quem instala o equipamento na quadra precisa de um monitor para entrar no Wi-Fi do local. Depois que o Raspberry entra nessa rede, o celular não acha a interface: o endereço muda, a porta é 3000 e vários roteadores isolam os aparelhos entre si. Sem a página, não dá para ver a imagem e apontar a câmera.

## Resultado

O celular entra na rede Wi-Fi do próprio aparelho, abre a interface e, na aba Live, aponta a câmera. Na aba Rede, escolhe o Wi-Fi da quadra para a sincronização continuar.

## Fora de escopo

- Configurar a rede por Bluetooth ou por aplicativo nativo.
- Portal que sequestra o DNS do celular.
- Wi-Fi empresarial (usuário e senha de domínio) e rede da quadra que exige login numa página do navegador.
- Segundo adaptador USB.
- Mudar captura, clipe, upload ou a tela de login.
- Criar ponto de acesso no Windows de desenvolvimento.

## Comportamento

1. Dado o Raspberry ligado, com ou sem a rede da quadra, quando o rádio sobe, então o aparelho publica uma rede Wi-Fi própria, com senha, no endereço `192.168.4.1`.
2. Dado o celular nessa rede, quando a pessoa abre `http://192.168.4.1`, então aparece a mesma interface, já na porta 80. O login continua o da sessão.
3. Dado o operador autenticado na aba Live, quando a câmera está em captura, então a imagem da aba é a referência para apontar a câmera.
4. Dado o operador autenticado na aba Rede, quando a tela abre, então mostra o nome da rede do aparelho, a senha, o endereço da página, se a rede da quadra está conectada e a lista de redes visíveis.
5. Dado uma rede da quadra escolhida e a senha informada (em branco só se a rede for aberta), quando o operador confirma, então o Raspberry entra nessa rede pelo rádio cliente e a rede do aparelho continua no ar. A senha da quadra não aparece em log.
6. Dado a rede da quadra conectada, quando há internet, então a sincronização segue por ela. O celular nessa hora também pode sair à internet pelo aparelho.
7. Dado a rede da quadra ausente, quando o celular está na rede do aparelho, então a interface abre mesmo assim. O telefone pode avisar que não há internet; a pessoa mantém a conexão.
8. Dado o Windows de desenvolvimento, quando o operador abre a aba Rede, então a tela explica que a rede direta existe no Raspberry.
9. Dado dois aparelhos no mesmo lugar, quando os dois sobem a rede direta, então o nome de cada uma termina com os quatro últimos caracteres do MAC, para não coincidirem.
10. Dado a interface virtual do ponto de acesso sumiu, quando passa cerca de um minuto, então o sistema tenta recriá-la sem apagar a rede da quadra.

## Critérios de aceite

- [x] O nome da rede e o MAC local do ponto de acesso são determinísticos e têm teste.
- [x] A validação da rede da quadra rejeita senha fora de 8 a 63 caracteres e não devolve a senha na mensagem de erro.
- [x] A API autenticada `GET /api/network`, `GET /api/network/wifi` e `POST /api/network/wifi` existe. Sem sessão, responde 401.
- [x] A aba Rede mostra a rede do aparelho e permite escolher a rede da quadra, em português.
- [x] A aba Live diz que aquela imagem serve para apontar a câmera.
- [ ] No Raspberry, a rede direta usa uma interface virtual e não substitui o cliente Wi-Fi da quadra. A porta 80 chega na interface.
- [x] O manual de campo descreve o primeiro acesso sem monitor.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Leitura e troca da rede da quadra via helper privilegiado |
| Armazenamento e sync | Nenhuma mudança de fila. O upload continua saindo pela rota padrão, que permanece a da quadra |
| Configuração (`.env`) | Nenhuma variável nova. A senha da rede do aparelho fica em `/etc/olho-no-lance/access-point.env` |
| API e UI | Rotas `/api/network` e aba Rede. Live ganha a frase de enquadramento |
| Raspberry Pi / Windows | O ponto de acesso, o redirecionamento da porta 80 e o hostname `olho-no-lance` só no Pi. No Windows a aba informa que a função é do aparelho |

## Restrições

O mesmo rádio faz o cliente da quadra e o ponto de acesso, no canal da rede da quadra, em 2,4 GHz. Isso divide a capacidade do rádio. A imagem da Live cabe; o celular não deve usar essa rede para outra coisa além da interface.

No Raspberry Pi OS Trixie há relato de o firmware do rádio cair com as duas funções ao mesmo tempo. O ensaio de campo observa se a rede do aparelho continua no ar com um celular conectado. Se cair, o timer recria a interface.

A página segue em HTTP na rede local, como o login que já existe.

## Perguntas em aberto

- Nenhuma. Bluetooth fica fora. A rede direta permanente é o caminho de campo. A rede da quadra continua só para a sincronização e, quando existe, o celular também navega por ela.

## Verificação

Teste Vitest do nome da rede, do MAC e da validação da senha. No equipamento: o celular entra na rede do aparelho, abre `http://192.168.4.1`, vê a aba Live e grava a rede da quadra sem derrubar o ponto de acesso. `nmcli` mostra `wlan0` na quadra e `ap0` na rede do aparelho.

## Notas de implementação

A rede do aparelho é a interface virtual `ap0`, criada por `deploy/raspberry-pi/olho-ap0-ensure.sh`. O `wlan0` continua cliente da quadra. A senha da rede do aparelho fica em `/etc/olho-no-lance/access-point.env`. A porta 80 é redirecionada para `APP_PORT` (3000). O serviço chama `sudo -n /usr/local/sbin/olho-rede`; a senha da quadra entra pelo stdin e o log só guarda o nome da rede e se a troca deu certo. Um timer de 60 segundos recria o `ap0` e, se o `wlan0` sumiu, recarrega o driver `brcmfmac`. O ensaio no equipamento ainda não foi feito: o protótipo está no Raspberry Pi OS Trixie, em que esse modo duplo do rádio já apresentou falha de firmware.
