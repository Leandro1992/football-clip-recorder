# Armazenamento e sincronização

## Retenção por disco
Os clipes em `runtime/clips` podem ocupar até `STORAGE_MAX_PERCENT_FREE` % (padrão 50) do espaço
**disponível para clipes** = espaço livre atual + espaço já usado pelos clipes (o orçamento não
encolhe conforme os clipes enchem o disco). Ex.: 20 GB livres e nenhum clipe → até 10 GB.
Além disso, `STORAGE_MAX_BYTES` aplica um teto absoluto (padrão 10 GB), mesmo que haja mais espaço livre.
Ao exceder, os clipes mais antigos são apagados; os já sincronizados saem primeiro e apagar um
clipe ainda não sincronizado gera o log `CLIP_EVICTED` (warn). A verificação roda a cada clipe e
a cada `STORAGE_RETENTION_INTERVAL_SECONDS`.

## Retenção na nuvem
No provedor S3/R2, após cada upload o sistema calcula o total armazenado no bucket/prefixo e remove
os objetos mais antigos quando excede `CLOUD_MAX_BYTES` (padrão 10 GB), registrando `CLOUD_CLIP_EVICTED`.
No provedor mock o mesmo limite (`CLOUD_MAX_BYTES`) é aplicado no diretório `mock-s3/`.

## Sincronização offline-first
- `ConnectivityMonitor` faz HEAD em `SYNC_CONNECTIVITY_URL` a cada `SYNC_CHECK_INTERVAL_SECONDS`.
- Sem internet os uploads ficam pausados; clipes continuam sendo gravados localmente.
- Ao voltar a conexão a fila retoma e uploads com falha são reenfileirados
  (também a cada `SYNC_RETRY_INTERVAL_SECONDS`).
- O estado fica em `runtime/sync-state.json`; ao reiniciar, clipes em disco não sincronizados
  voltam para a fila.
- Provedor de nuvem plugável: implemente `ClipStorage` (`upload(filePath, metadata)`) em
  `packages/storage` e registre em `create-clip-storage.ts`. Já existe `S3Storage` compatível
  com qualquer serviço S3 via `S3_ENDPOINT`.

## Sugestão barata/gratuita para um app de terceiros consumir os vídeos
**Cloudflare R2** (recomendado): API S3-compatível, 10 GB grátis, **sem custo de egress**.
1. Crie o bucket e um API token (Object Read & Write) no painel do Cloudflare.
2. No `.env` do Pi: `STORAGE_PROVIDER=s3`, `AWS_REGION=auto`, `AWS_S3_BUCKET=<bucket>`,
   `S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`, `S3_PREFIX=clips` e as variáveis
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` do token.
3. O terceiro consome por **URLs pré-assinadas** (geradas pelo seu backend, expiram) ou por domínio
   público do bucket (custom domain) para vídeos que podem ser abertos; para ser avisado de novos
   clipes, use R2 Event Notifications + Worker (webhook) ou liste o prefixo periodicamente.

Alternativas: Backblaze B2 (10 GB grátis, S3-compatível), Supabase Storage (1 GB grátis, URLs
assinadas prontas), Google Drive (grátis, mais trabalhoso). Para só expor o Pi, Tailscale Funnel
ou Cloudflare Tunnel funcionam, mas dependem do Pi estar online.