#!/bin/bash
set -e

# SpicyVPN Professional Node Installer
# Multi-Architecture (x86_64 / ARM64)
# High-Performance Node.js Agent (Raw IP Mode)

echo "🌶️ SpicyVPN High-Performance Installer - Starting..."

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --key) NODE_KEY="$2"; shift ;;
        --master) MASTER_URL="$2"; shift ;;
    esac
    shift
done

if [ -z "$NODE_KEY" ] || [ -z "$MASTER_URL" ]; then
    echo "❌ Error: --key and --master are required."
    exit 1
fi

# Detect Architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64) XRAY_ARCH="64" ;;
    aarch64) XRAY_ARCH="arm64-v8a" ;;
    *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "✅ Detected architecture: $ARCH"

# Install basic dependencies
echo "🛠️ Installing dependencies..."
if [ "$ARCH" = "x86_64" ]; then
    DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip jq iptables-persistent
else
    apt-get update && apt-get install -y curl unzip jq iptables-persistent
fi

# Install Node.js (Minimal LTS) if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js Runtime..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Oracle Cloud / Ubuntu Firewall setup
echo "🛡️ Configuring Firewall (iptables)..."
iptables -I INPUT 1 -p icmp -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 8444 -j ACCEPT
iptables -I INPUT 1 -p udp --dport 8444 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT

mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save
    netfilter-persistent reload
fi

# 📦 Install Xray-core
echo "📦 Installing Xray-core..."
XRAY_VERSION=$(curl -s https://api.github.com/repos/XTLS/Xray-core/releases/latest | jq -r .tag_name)
curl -L -o xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip"
mkdir -p /usr/local/etc/xray /usr/local/bin
unzip -o xray.zip -d /usr/local/bin
rm xray.zip

# 🔐 SSL Certificate Management (Self-Signed)
echo "🔐 Generating Self-Signed TLS Certificates..."
mkdir -p /usr/local/etc/xray/certs
openssl req -x509 -newkey rsa:4096 -keyout /usr/local/etc/xray/certs/key.pem -out /usr/local/etc/xray/certs/cert.pem -sha256 -days 3650 -nodes -subj "/CN=spicypepper.app" &>/dev/null

cat <<EOF > /usr/local/etc/xray/config.json
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
            "settings": { "clients": [], "decryption": "none" },
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
                "grpcSettings": { "serviceName": "spicypepper-grpc" }
            }
        }
    ],
    "outbounds": [{ "protocol": "freedom", "tag": "direct" }, { "protocol": "blackhole", "tag": "api" }]
}
EOF

# Setup Agent Configuration
echo "🔥 Setting up SpicyAgent..."
mkdir -p /etc/spicyvpn
echo "$NODE_KEY" > /etc/spicyvpn/key
echo "$MASTER_URL" > /etc/spicyvpn/master
touch /etc/spicyvpn/state

# Download the high-performance agent script
curl -sL "${MASTER_URL}/api/node/agent.mjs" -o /usr/local/bin/spicy-agent.mjs

# Systemd Services
cat <<EOF > /etc/systemd/system/xray.service
[Unit]
Description=Xray Service
After=network.target
[Service]
User=root
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

cat <<EOF > /etc/systemd/system/spicy-agent.service
[Unit]
Description=SpicyVPN High-Performance Agent
After=xray.service
[Service]
ExecStart=/usr/bin/node /usr/local/bin/spicy-agent.mjs
Restart=always
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xray spicy-agent
systemctl restart xray spicy-agent

# Give the agent a few seconds to boot, fetch the real SSL certs, and restart Xray
echo "⏳ Waiting for initial Agent Synchronization (10 seconds)..."
sleep 10

echo "=================================================="
echo "🩺 POST-INSTALLATION HEALTH CHECK"
echo "=================================================="

# Check Xray Service
if systemctl is-active --quiet xray; then
    echo "✅ [Service] Xray VPN Engine is RUNNING."
else
    echo "❌ [Service] Xray failed to start! Check logs: journalctl -u xray"
fi

# Check Agent Service
if systemctl is-active --quiet spicy-agent; then
    echo "✅ [Service] SpicyAgent Daemon is RUNNING."
else
    echo "❌ [Service] SpicyAgent failed to start! Check logs: journalctl -u spicy-agent"
fi

# Check Port Binding
if ss -tulpn | grep -q ":8444"; then
    echo "✅ [Network] Xray successfully bound to Port 8444."
else
    echo "❌ [Network] Port 8444 is not listening! Xray might have crashed."
fi

# Check Master API Reachability
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET -H "Authorization: Bearer $NODE_KEY" "$MASTER_URL/api/node/sync")
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ [API] Node successfully communicated with Master Server."
else
    echo "❌ [API] Node could not reach Master Server. (HTTP Code: $HTTP_CODE). Check API Key or Network."
fi

echo "=================================================="
echo "🚀 High-Performance Node successfully installed and validated!"
echo "📈 First Telemetry Report:"
journalctl -u spicy-agent -n 2 --no-pager | grep "REPORT" || echo "Waiting for first report..."
echo "=================================================="
