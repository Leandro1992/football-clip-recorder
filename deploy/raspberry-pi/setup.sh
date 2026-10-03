#!/usr/bin/env bash
# Run on the Raspberry Pi from the project root: bash deploy/raspberry-pi/setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_USER="$(id -un)"

sudo apt-get update
sudo apt-get install -y ffmpeg v4l-utils alsa-utils gpiod curl ca-certificates

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo usermod -aG video,audio,gpio "$APP_USER" || true

cd "$APP_DIR"
[ -f .env ] || cp deploy/raspberry-pi/env.example .env
npm install
npm run build

NODE_BIN="$(command -v node)"
sed -e "s|__USER__|$APP_USER|g" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__NODE__|$NODE_BIN|g" \
  deploy/raspberry-pi/football-clip-recorder.service | sudo tee /etc/systemd/system/football-clip-recorder.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now football-clip-recorder

echo "Pronto. Acesse http://$(hostname -I | awk '{print $1}'):3000"
echo "Logs: journalctl -u football-clip-recorder -f"
