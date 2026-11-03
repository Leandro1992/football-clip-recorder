#!/usr/bin/env bash
# Atualiza o app no Raspberry Pi a partir do GitHub: bash deploy/raspberry-pi/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# O processo em execução é o script de antes do pull. Roda de novo o arquivo novo na mesma atualização.
if [ "${1:-}" != "--apply" ]; then
  git checkout -- package-lock.json
  git pull --ff-only
  exec bash "$0" --apply
fi
npm install
npm run build
bash deploy/raspberry-pi/setup-access-point.sh "$(id -un)"
sudo systemctl restart football-clip-recorder
echo "Atualizado: $(git log --oneline -1)"
