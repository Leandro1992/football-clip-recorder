#!/bin/bash
# Encaminha a porta 80 do próprio aparelho para a interface.
# Não mexe no HTTP que o celular envia para a internet: senão o Android abre um login de rede e sai do Wi-Fi.
set -euo pipefail

ENV_FILE=/etc/olho-no-lance/access-point.env
APP_PORT=3000

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

APP_PORT="${APP_PORT:-3000}"
if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]]; then
  echo "APP_PORT inválida" >&2
  exit 1
fi

if ! command -v nft >/dev/null 2>&1; then
  echo "nft ausente" >&2
  exit 1
fi

nft delete table ip olho >/dev/null 2>&1 || true
nft -f - << EOF
table ip olho {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    tcp dport 80 fib daddr type local redirect to :${APP_PORT}
  }
}
EOF
