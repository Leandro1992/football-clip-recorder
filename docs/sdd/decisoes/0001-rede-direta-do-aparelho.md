# 0001 — A interface de campo abre pela rede do aparelho

- Status: aceita
- Data: 2026-11-03
- Evolução: `docs/sdd/evolucoes/0007-rede-direta-do-aparelho.md`

## Contexto

Na quadra não há monitor, o IP do DHCP muda e o roteador do local costuma impedir o celular de falar com o Raspberry. A imagem para apontar a câmera já existe na aba Live; o que falta é um caminho estável até ela.

## Decisão

O operador abre a interface pela rede Wi-Fi do próprio aparelho. A rede da quadra fica para a sincronização dos clipes.

## Consequências

Evoluções de campo tratam `http://192.168.4.1` como o endereço que a pessoa usa no celular. Achar o equipamento pelo IP da quadra é um atalho, não o caminho principal. A captura não espera nenhuma das duas redes.

## Alternativas deixadas de lado

- Bluetooth para a primeira senha. No iPhone isso pede aplicativo, e a imagem da câmera continua precisando do navegador.
- Portal só na primeira vez, desligando a rede do aparelho depois. O celular volta a depender do roteador da quadra para achar a interface.
- Um segundo rádio USB. Resolve o mesmo problema com uma peça a mais; o rádio de bordo do Pi 4 e do Pi 5 faz as duas funções.
