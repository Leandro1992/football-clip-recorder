#!/usr/bin/env bash
# Atualiza o app no Raspberry Pi a partir do GitHub: bash deploy/raspberry-pi/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# npm install may rewrite the lockfile on the Pi (different platform); discard so pull stays clean.
git checkout -- package-lock.json
git pull --ff-only
npm install
npm run build
sudo systemctl restart football-clip-recorder
echo "Atualizado: $(git log --oneline -1)"
