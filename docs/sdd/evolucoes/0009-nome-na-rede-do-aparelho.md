# 0009 — Nome na rede do aparelho

- Status: concluida
- Data: 2026-11-03
- Relacionada a: [0007-rede-direta-do-aparelho.md](0007-rede-direta-do-aparelho.md)

## Problema

Quem abre a interface no celular precisa lembrar `192.168.4.1`.

## Resultado

Na rede Wi-Fi do aparelho, `http://olhonolance.admin` abre a mesma página.

## Fora de escopo

- Sequstrar o DNS do celular ou impedir o acesso a outros sites.
- Publicar esse nome na rede da quadra.
- Certificado HTTPS.

## Comportamento

1. Dado o celular na rede do aparelho, quando a pessoa abre `http://olhonolance.admin`, então chega na interface, na porta 80.
2. Dado o mesmo celular, quando o nome não resolve, então `http://192.168.4.1` continua abrindo a interface.
3. Dado o celular na rede da quadra, quando alguém pede `olhonolance.admin`, então esse nome não é garantia. O caminho sem o roteador da quadra continua sendo a rede do aparelho.

## Critérios de aceite

- [x] O manual e a aba Rede mostram `http://olhonolance.admin`.
- [x] O DNS da rede do aparelho responde esse nome com o endereço do ponto de acesso.

## Impacto

| Área | Mudança esperada |
| --- | --- |
| Domínio (`packages/core`, `packages/video`) | Nenhuma |
| Câmera / hardware | Nenhuma |
| Armazenamento e sync | Nenhuma |
| Configuração (`.env`) | Nenhuma variável nova |
| API e UI | A aba Rede cita o nome além do IP |
| Raspberry Pi / Windows | O nome existe no DNS do ponto de acesso. No Windows a rede direta continua ausente |

## Restrições

O celular precisa usar o DNS entregue pela rede do aparelho. DNS privado apontando para um provedor de fora ignora o nome.

## Perguntas em aberto

- Nenhuma.

## Verificação

No aparelho, uma consulta ao DNS `192.168.4.1` devolve `olhonolance.admin` para esse endereço. O celular entra na rede e abre o nome.

## Notas de implementação

O `dnsmasq` que o NetworkManager já sobe na rede compartilhada lê `/etc/NetworkManager/dnsmasq-shared.d/olho.conf`. O arquivo tem `address=/olhonolance.admin/192.168.4.1`.
