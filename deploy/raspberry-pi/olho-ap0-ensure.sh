#!/bin/bash
# Mantém a interface virtual ap0. A rede da quadra continua no wlan0.
set -euo pipefail

ENV_FILE=/etc/olho-no-lance/access-point.env
MODE="${1:-}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

AP_SSID_PREFIX="${AP_SSID_PREFIX:-Olho no lance}"
AP_PASSWORD="${AP_PASSWORD:-olhonolance}"
AP_ADDRESS="${AP_ADDRESS:-192.168.4.1}"

prefix_re='^[A-Za-z0-9][A-Za-z0-9 ._-]{0,22}[A-Za-z0-9]$'
password_re='^[A-Za-z0-9._-]{8,63}$'
address_re='^([0-9]{1,3}\.){3}[0-9]{1,3}$'

if ! [[ "$AP_SSID_PREFIX" =~ $prefix_re ]]; then
  echo "AP_SSID_PREFIX inválido em $ENV_FILE" >&2
  exit 1
fi
if ! [[ "$AP_PASSWORD" =~ $password_re ]]; then
  echo "AP_PASSWORD inválida em $ENV_FILE" >&2
  exit 1
fi
if ! [[ "$AP_ADDRESS" =~ $address_re ]]; then
  echo "AP_ADDRESS inválido em $ENV_FILE" >&2
  exit 1
fi

wait_wlan() {
  local attempt
  for attempt in $(seq 1 30); do
    if [ -d /sys/class/net/wlan0 ]; then
      return 0
    fi
    sleep 1
  done
  echo "wlan0 não apareceu" >&2
  return 1
}

recover_driver() {
  if [ -d /sys/class/net/wlan0 ]; then
    return 0
  fi
  modprobe -r brcmfmac || true
  modprobe brcmfmac || true
  sleep 2
}

ap_mac_of() {
  python3 - "$1" << 'PY'
import sys
parts = sys.argv[1].strip().lower().split(":")
if len(parts) != 6:
    raise SystemExit("mac inválido")
first = int(parts[0], 16)
parts[0] = f"{(first | 0x02) & 0xFE:02x}"
if ":".join(parts) == sys.argv[1].strip().lower():
    parts[5] = f"{int(parts[5], 16) ^ 0x01:02x}"
print(":".join(parts))
PY
}

create_ap0() {
  local wlan_mac
  wlan_mac="$(cat /sys/class/net/wlan0/address)"
  AP_MAC_VALUE="$(ap_mac_of "$wlan_mac")"
  if [ ! -d /sys/class/net/ap0 ]; then
    iw dev wlan0 interface add ap0 type __ap
    ip link set ap0 address "$AP_MAC_VALUE"
  fi
  ip link set ap0 up
}

radio_stay_awake() {
  iw dev ap0 set power_save off 2>/dev/null || true
  iw dev wlan0 set power_save off 2>/dev/null || true
}

install_ap_dns() {
  local file=/etc/NetworkManager/dnsmasq-shared.d/olho.conf
  local desired="address=/olhonolance.admin/${AP_ADDRESS}"
  mkdir -p /etc/NetworkManager/dnsmasq-shared.d
  if [ -f "$file" ] && grep -qxF "$desired" "$file"; then
    return 0
  fi
  printf '%s\n' "$desired" > "$file"
  if [ "$MODE" != "--interface-only" ] && ap_is_active; then
    nmcli connection up olho-ap
  fi
}

ssid_for() {
  local compact suffix
  compact="$(cat /sys/class/net/wlan0/address | tr -d ':' | tr '[:lower:]' '[:upper:]')"
  suffix="${compact: -4}"
  printf '%s %s' "$AP_SSID_PREFIX" "$suffix"
}

profile_exists() {
  nmcli -t -f NAME connection show | grep -qx 'olho-ap'
}

ap_is_active() {
  nmcli -t -f NAME,DEVICE connection show --active | grep -qx 'olho-ap:ap0'
}

upsert_profile() {
  local ssid="$1"
  local mac="$2"
  if profile_exists; then
    nmcli connection modify olho-ap \
      connection.interface-name ap0 \
      connection.autoconnect yes \
      802-11-wireless.ssid "$ssid" \
      802-11-wireless.mode ap \
      802-11-wireless.band bg \
      802-11-wireless.cloned-mac-address "$mac" \
      ipv4.method shared \
      ipv4.addresses "${AP_ADDRESS}/24" \
      ipv4.never-default yes \
      802-11-wireless.powersave disable \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.proto rsn \
      wifi-sec.pairwise ccmp \
      wifi-sec.psk "$AP_PASSWORD"
  else
    nmcli connection add \
      type wifi \
      ifname ap0 \
      con-name olho-ap \
      connection.autoconnect yes \
      ssid "$ssid" \
      802-11-wireless.mode ap \
      802-11-wireless.band bg \
      802-11-wireless.cloned-mac-address "$mac" \
      ipv4.method shared \
      ipv4.addresses "${AP_ADDRESS}/24" \
      ipv4.never-default yes \
      802-11-wireless.powersave disable \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.proto rsn \
      wifi-sec.pairwise ccmp \
      wifi-sec.psk "$AP_PASSWORD"
  fi
}

AP_MAC_VALUE=""
rfkill unblock wifi || true

if [ "$MODE" = "--recover" ]; then
  recover_driver || true
fi

wait_wlan
create_ap0
radio_stay_awake

if [ "$MODE" = "--interface-only" ]; then
  exit 0
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli ausente. Use Raspberry Pi OS com NetworkManager." >&2
  exit 1
fi

if ! nmcli general status >/dev/null 2>&1; then
  echo "NetworkManager ainda não está pronto" >&2
  exit 0
fi

SSID_VALUE="$(ssid_for)"

if [ "$MODE" = "--configure" ] || ! profile_exists; then
  upsert_profile "$SSID_VALUE" "$AP_MAC_VALUE"
fi

install_ap_dns
radio_stay_awake

if [ "$MODE" != "--configure" ] && ap_is_active; then
  exit 0
fi

nmcli connection up olho-ap
radio_stay_awake
