# Glossário

| Termo | Significado neste projeto |
| --- | --- |
| Lance | Jogadas que o operador quer guardar. O sistema não classifica gol; ele guarda o trecho em torno do gatilho |
| Gatilho | Pressionar o botão virtual ou o GPIO. Inicia a janela pós-evento e a montagem do clipe |
| Segmento | MP4 curto produzido sem parar pela câmera. Unidade do buffer |
| Buffer | Janela dos segmentos recentes. O que fica para trás do instante do gatilho |
| Pós-evento | Segundos gravados depois do gatilho, antes de fechar o clipe |
| Clipe | MP4 final, com metadados (`ClipMetadata`) e status de armazenamento |
| Equipamento | Cadastro local de câmeras e botões (`equipment-config.json`), separado do processo FFmpeg em execução |
| Vínculo | Associação gravada entre um botão e uma ou mais câmeras. Câmera ativa com botão ativo entra na aba Live. O clipe ainda sai da câmera configurada no ambiente |
| Provedor | Implementação de `ClipStorage`: `mock` (pasta `mock-s3/`) ou `s3` (AWS ou compatível, inclusive R2) |
| Retenção | Apagar clipes antigos ao passar do teto local ou do teto na nuvem |
| Sincronização | Fila que segura o upload sem rede e continua quando a conectividade volta |
| Operador | Pessoa na quadra usando a interface ou o botão físico |
