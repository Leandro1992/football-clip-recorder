# Design system

A interface é usada no celular, ao sol, com o dedo, enquanto a partida acontece. O desenho serve esse momento. A spec da mudança está em [evolucoes/0011-interface-de-campo.md](evolucoes/0011-interface-de-campo.md).

## Princípios

1. Uma ação principal por tela. No jogo, essa ação é registrar o lance.
2. O polegar alcança a navegação e o botão de gravar sem procurar no topo.
3. A imagem da câmera mostra o quadro inteiro, para apontar o aparelho.
4. Texto em português, curto, sem nome de arquivo, de processo ou de commit na tela de uso.
5. Configuração rara fica atrás da configuração do dia. Câmera e botão aparecem antes de Cloudflare, GPIO e caminho de dispositivo.
6. A mesma estrutura vale no celular e no computador. No computador a navegação sobe para o topo; no celular ela fica embaixo.

## Cor

| Token | Valor | Uso |
| --- | --- | --- |
| Campo | `#146c43` | Botão de gravar, item ativo, marca |
| Campo escuro | `#0c3d26` | Barra superior |
| Papel | `#f3f6f1` | Fundo da página |
| Cartão | `#ffffff` | Superfície |
| Tinta | `#132018` | Texto |
| Linha | `#d5e0d6` | Borda |
| Aviso | `#b54708` | Atenção |
| Falha | `#b42318` | Erro |
| Ok | `#067647` | Envio concluído, rede no ar |

O fundo é claro para ler sob sol. A imagem da câmera fica numa moldura escura.

## Tipo e toque

Fonte do sistema. Sem fonte baixada da internet: o celular pode estar só na rede do aparelho.

| Uso | Tamanho |
| --- | --- |
| Título da tela | 22 px |
| Corpo | 16 px |
| Apoio | 13 px |

Alvo de toque mínimo: 48 px de altura. Espaço entre alvos vizinhos: 8 px. Cantos dos cartões: 16 px. O conteúdo respeita a área segura do celular.

## Navegação

Quatro destinos, sempre visíveis:

| Destino | Para quê |
| --- | --- |
| Jogo | Ver a câmera e registrar o lance |
| Lances | Ver, abrir, reenviar e apagar vídeos |
| Cadastro | Câmeras, buckets, botões e a quadra que associa os três |
| Ajustes | Rede, saúde e atualização |

No celular, a barra fica fixa na base. A partir de 900 px, os mesmos quatro itens ficam no topo.

## Componentes

- **Botão de lance:** largura total, verde, uma linha. Fica visível junto da imagem. Enquanto grava, mostra o que está acontecendo e não aceita outro toque.
- **Cartão:** uma câmera, um lance ou um ajuste. Nada de tabela.
- **Campo:** rótulo acima, altura de toque, uma coluna no celular.
- **Aviso:** uma frase. Saúde crítica aparece no Jogo; o detalhe fica em Ajustes.
- **Avançado:** caminho do dispositivo, pino GPIO e nova quadra começam fechados.

## Telas

**Jogo.** Nome da quadra em uso, uma frase de estado, a imagem de cada câmera e o botão Registrar lance. Os últimos lances ficam abaixo, só com horário e se o envio acabou.

**Lances.** Um cartão por vídeo: quadra, câmera, horário, tamanho e se já subiu. Abrir e Reenviar ficam no cartão. Apagar pede a seleção e o destino: aparelho, nuvem ou os dois.

**Cadastro.** Câmeras, buckets e botões ficam em blocos separados. A quadra é o último bloco e só associa itens já cadastrados. Access key e secret aparecem em texto no bucket. Salvar fica no fim, em largura total.

**Ajustes.** Uma lista: envio da quadra em uso, rede, saúde do aparelho, atualização. Cada item abre a própria tela e volta para a lista.
