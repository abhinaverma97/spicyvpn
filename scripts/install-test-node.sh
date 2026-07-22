#!/bin/bash
set -e

# SpicyVPN Test Node Installer
# Fully isolated - no master, no fleet, no agent.
# 1:1 identical Xray config to production node.
# Outputs a VLESS link compatible with Hiddify.

echo "=========================================="
echo "  SpicyVPN Test Node Installer"
echo "  (Isolated - no fleet registration)"
echo "=========================================="
echo ""

IP=""
DOMAIN=""
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --ip) IP="$2"; shift ;;
    --domain) DOMAIN="$2"; shift ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$IP" ]; then
  echo "Usage: $0 --ip <public-ip> [--domain <domain>]"
  exit 1
fi

HOST="${DOMAIN:-$IP}"
SERVICE_NAME="spicyvpn-test-grpc"

ARCH=$(uname -m)
case $ARCH in
  x86_64) XRAY_ARCH="64" ;;
  aarch64) XRAY_ARCH="arm64-v8a" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac
echo "Architecture: $ARCH"

apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl unzip jq openssl iptables-persistent uuid-runtime 2>/dev/null

UUID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null)
echo "Test user UUID: $UUID"

# --- Kernel TCP Tuning (identical to production) ---
echo "Applying kernel TCP optimizations..."
cat >> /etc/sysctl.d/99-spicyvpn-test.conf <<EOF
# SpicyVPN TCP tuning
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_notsent_lowat = 131072
EOF
sysctl -p /etc/sysctl.d/99-spicyvpn-test.conf >/dev/null 2>&1
echo "TCP tuning applied (BBR, fq, fastopen)"

# --- Install Xray-core ---
XRAY_VERSION=$(curl -s https://api.github.com/repos/XTLS/Xray-core/releases/latest | jq -r .tag_name)
curl -sL -o xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip"
mkdir -p /usr/local/etc/xray/certs /usr/local/bin
unzip -o xray.zip -d /usr/local/bin >/dev/null
rm xray.zip
echo "Xray $XRAY_VERSION installed"

# --- Self-signed TLS cert ---
openssl req -x509 -newkey rsa:4096 -keyout /usr/local/etc/xray/certs/key.pem \
  -out /usr/local/etc/xray/certs/cert.pem -sha256 -days 3650 -nodes \
  -subj "/CN=${HOST}" &>/dev/null
echo "TLS cert generated (CN=${HOST})"

# --- Xray config (1:1 with production, except clients has inline UUID) ---
cat > /usr/local/etc/xray/config.json <<CONFEOF
{
    "log": { "loglevel": "warning" },
    "api": { "tag": "api", "services": ["HandlerService", "StatsService"] },
    "stats": {},
    "policy": {
        "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
        "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
    },
    "routing": {
        "rules": [{ "inboundTag": ["api"], "outboundTag": "api", "type": "field" }]
    },
    "inbounds": [
        {
            "listen": "127.0.0.1", "port": 10085, "protocol": "dokodemo-door",
            "settings": { "address": "127.0.0.1" }, "tag": "api"
        },
        {
            "port": 8444, "protocol": "vless", "tag": "vless-grpc",
            "settings": {
                "clients": [
                    {
                        "id": "${UUID}",
                        "flow": "",
                        "email": "test@spicyvpn"
                    }
                ],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "grpc",
                "security": "tls",
                "tlsSettings": {
                    "alpn": ["h2", "http/1.1"],
                    "certificates": [{
                        "certificateFile": "/usr/local/etc/xray/certs/cert.pem",
                        "keyFile": "/usr/local/etc/xray/certs/key.pem"
                    }]
                },
                "grpcSettings": {
                    "serviceName": "${SERVICE_NAME}"
                }
            }
        }
    ],
    "outbounds": [
        { "protocol": "freedom", "tag": "direct" },
        { "protocol": "blackhole", "tag": "api" }
    ]
}
CONFEOF
echo "Xray config written (1:1 with production)"

# --- Firewall (identical rules to production) ---
iptables -I INPUT 1 -p icmp -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -p tcp --dport 8444 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -p udp --dport 8444 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
echo "Firewall: ports 80, 443, 8444, ICMP open"

# --- systemd service ---
cat > /etc/systemd/system/xray-test.service <<SERVICEOF
[Unit]
Description=SpicyVPN Test Node (Xray)
After=network.target
[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1000000
[Install]
WantedBy=multi-user.target
SERVICEOF

systemctl daemon-reload
systemctl enable xray-test.service 2>/dev/null
systemctl restart xray-test.service
echo "Service xray-test started"

# --- Verify ---
sleep 2
if systemctl is-active --quiet xray-test; then
  echo "Xray is RUNNING"
else
  echo "Xray failed to start - check: journalctl -u xray-test -n 30"
fi

if ss -tulpn | grep -q ":8444"; then
  echo "Port 8444 is LISTENING"
else
  echo "Port 8444 not listening"
fi

# --- VLESS link (matches production format from app/api/sub/route.ts) ---
VLESS_LINK="vless://${UUID}@${HOST}:8444?security=tls&sni=google.com&alpn=h2,http/1.1&fp=chrome&type=grpc&serviceName=${SERVICE_NAME}&allowInsecure=1#SpicyVPN-Test-${HOST}"

echo ""
echo "=========================================="
echo "  TEST NODE READY"
echo "=========================================="
echo ""
echo "  Host:       ${HOST}"
echo "  Port:       8444"
echo "  UUID:       ${UUID}"
echo "  Service:    ${SERVICE_NAME}"
echo "  SNI:        ${SNI}"
echo ""
echo "  --- Import this link into Hiddify ---"
echo ""
echo "  ${VLESS_LINK}"
echo ""
echo "=========================================="
echo "  Remove when done:"
echo "    systemctl stop xray-test"
echo "    systemctl disable xray-test"
echo "    rm -rf /usr/local/etc/xray /usr/local/bin/xray"
echo "    rm /etc/systemd/system/xray-test.service"
echo "    rm /etc/sysctl.d/99-spicyvpn-test.conf"
echo "=========================================="
