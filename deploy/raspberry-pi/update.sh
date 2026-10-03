#!/usr/bin/env bash
# Atualiza o app no Raspberry Pi a partir do GitHub: bash deploy/raspberry-pi/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
git pull --ff-only
npm install
npm run build
sudo systemctl restart football-clip-recorder
echo "Atualizado: $(git log --oneline -1)"
