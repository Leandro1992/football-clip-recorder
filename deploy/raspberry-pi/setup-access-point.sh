#!/usr/bin/env bash
# Instala a rede Wi-Fi do aparelho. Uso: bash deploy/raspberry-pi/setup-access-point.sh <usuário-do-serviço>
set -euo pipefail

APP_USER="${1:-$(id -un)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if ! [[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "Usuário inválido para o sudoers: $APP_USER" >&2
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "Este setup precisa do NetworkManager (nmcli), presente no Raspberry Pi OS Bookworm e Trixie." >&2
  exit 1
fi

if ! command -v iw >/dev/null 2>&1 || ! command -v nft >/dev/null 2>&1 || ! dpkg -s avahi-daemon >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y iw nftables avahi-daemon python3 rfkill
fi

sudo mkdir -p /etc/olho-no-lance
if [ ! -f /etc/olho-no-lance/access-point.env ]; then
  sudo install -m 600 "$ROOT/deploy/raspberry-pi/access-point.env.example" /etc/olho-no-lance/access-point.env
fi

sudo install -m 755 "$ROOT/deploy/raspberry-pi/olho-rede" /usr/local/sbin/olho-rede
sudo install -m 755 "$ROOT/deploy/raspberry-pi/olho-ap0-ensure.sh" /usr/local/sbin/olho-ap0-ensure
sudo install -m 755 "$ROOT/deploy/raspberry-pi/olho-http-redirect.sh" /usr/local/sbin/olho-http-redirect

printf '%s\n' "$APP_USER ALL=(root) NOPASSWD: /usr/local/sbin/olho-rede" | sudo tee /etc/sudoers.d/olho-rede >/dev/null
sudo chmod 440 /etc/sudoers.d/olho-rede
sudo visudo -cf /etc/sudoers.d/olho-rede

if [ "$(hostname)" = "raspberrypi" ]; then
  sudo hostnamectl set-hostname olho-no-lance
  if grep -q '^127.0.1.1' /etc/hosts; then
    sudo sed -i 's/^127.0.1.1.*/127.0.1.1\tolho-no-lance/' /etc/hosts
  else
    echo '127.0.1.1 olho-no-lance' | sudo tee -a /etc/hosts >/dev/null
  fi
  sudo systemctl restart avahi-daemon || true
fi

sudo install -m 644 "$ROOT/deploy/raspberry-pi/olho-ap0.service" /etc/systemd/system/olho-ap0.service
sudo install -m 644 "$ROOT/deploy/raspberry-pi/olho-ap0-watch.service" /etc/systemd/system/olho-ap0-watch.service
sudo install -m 644 "$ROOT/deploy/raspberry-pi/olho-ap0-watch.timer" /etc/systemd/system/olho-ap0-watch.timer
sudo install -m 644 "$ROOT/deploy/raspberry-pi/olho-http-redirect.service" /etc/systemd/system/olho-http-redirect.service
sudo systemctl daemon-reload
sudo systemctl enable olho-ap0.service olho-ap0-watch.timer olho-http-redirect.service

sudo /usr/local/sbin/olho-ap0-ensure --interface-only
sudo /usr/local/sbin/olho-ap0-ensure --configure
sudo systemctl start olho-http-redirect.service
sudo systemctl start olho-ap0-watch.timer

SSID="$(nmcli -g 802-11-wireless.ssid connection show olho-ap 2>/dev/null || true)"
ADDRESS="$(ip -4 -o addr show dev ap0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1)"
echo "Rede do aparelho: ${SSID:-Olho no lance}"
echo "No celular, abra http://${ADDRESS:-192.168.4.1}"
echo "A senha padrão está em /etc/olho-no-lance/access-point.env"
