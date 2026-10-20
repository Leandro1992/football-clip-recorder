# Produto

## Promessa

Registrar o lance de uma partida amadora no momento em que alguém aperta o botão, sem operar um editor de vídeo. O equipamento fica na quadra, grava sozinho e guarda o clipe para ver e compartilhar depois.

## Quem usa

| Pessoa | O que faz |
| --- | --- |
| Operador de campo | Liga o equipamento, confere a imagem, aperta o botão no gol ou na interface |
| Quem assiste depois | Abre os clipes gravados na própria interface ou, no futuro, num app de terceiros |
| Quem instala | Configura câmera, áudio, botão GPIO e armazenamento no `.env` e na aba de equipamento |

Ainda não há conta por jogador, por time ou por campeonato. O acesso da interface é um usuário e uma senha do equipamento (`AUTH_USERNAME` / `AUTH_PASSWORD`).

## Situação de uso

- Quadra ou campo com câmera USB apontada para o jogo.
- Botão físico perto de quem vê o lance, ou o botão da interface no celular/notebook na mesma rede.
- Rede instável: o clipe nasce no disco e sobe quando a internet volta.
- Equipamento alvo de produção: Raspberry Pi com servidor headless. Windows com Electron serve para desenvolver.

## O que o produto já cobre

Descrito em [01-estado-atual.md](01-estado-atual.md): buffer contínuo, clipe sob gatilho, tela de login, visualização das câmeras vinculadas a um botão, lista de gravações, cadastro de equipamento, retenção de disco e fila de sincronização.

## O que ainda é evolução

Tudo o que não está na base entra em [evolucoes/](evolucoes/README.md). Exemplos do tipo de lacuna que uma spec pode fechar (ainda sem compromisso de fazer):

- Gravar um clipe por câmera, com o botão escolhendo o ângulo. A visualização já mostra a câmera vinculada; a gravação ainda é a câmera do `.env`.
- Trocar a câmera em uso sem reiniciar pelo `.env`.
- Botão GPIO validado em hardware de quadra.
- Consumo dos clipes por um aplicativo externo (URL, aviso de clipe novo).
- Identificar gol, time, jogador ou partida no clipe.

## Restrições de campo

- O Pi 4 codifica em software (`libx264 ultrafast`). Resolução alta compete com a CPU.
- Cartão SD enche. Retenção local é parte do produto, não um extra.
- Sem internet o jogo continua. Upload espera.
- GPIO e nomes de câmera mudam entre Windows, Pi 4 e Pi 5. A spec de hardware diz em qual placa foi pensada.
