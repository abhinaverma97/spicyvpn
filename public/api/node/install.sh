#!/bin/bash
set -e

# SpicyVPN Professional Node Installer
# Multi-Architecture (x86_64 / ARM64)
# Robust, Low-CPU Node.js Agent

echo "🌶️ SpicyVPN High-Performance Installer - Starting..."

# Parse arguments
NODE_DOMAIN=""
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --key) NODE_KEY="$2"; shift ;;
        --master) MASTER_URL="$2"; shift ;;
        --domain) NODE_DOMAIN="$2"; shift ;;
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
apt-get update && apt-get install -y curl unzip jq iptables-persistent certbot

# Install Node.js (Minimal LTS) if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js Runtime..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Oracle Cloud / Ubuntu Firewall setup
echo "🛡️ Configuring Firewall (iptables)..."
iptables -I INPUT 1 -p icmp -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 1 -p udp --dport 443 -j ACCEPT

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

# 🔐 SSL Certificate Management (Let's Encrypt)
if [ ! -z "$NODE_DOMAIN" ]; then
    echo "🔐 Obtaining real SSL certificates for $NODE_DOMAIN..."
    # Stop anything on port 80 to let certbot work
    systemctl stop caddy 2>/dev/null || true
    
    certbot certonly --standalone -d "$NODE_DOMAIN" --non-interactive --agree-tos --email webmaster@spicypepper.app
    
    CERT_PATH="/etc/letsencrypt/live/$NODE_DOMAIN/fullchain.pem"
    KEY_PATH="/etc/letsencrypt/live/$NODE_DOMAIN/privkey.pem"
    
    # Configure Xray to use Port 443 with Real TLS
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
            "port": 443, "protocol": "vless", "tag": "vless-grpc",
            "settings": { "clients": [], "decryption": "none" },
            "streamSettings": {
                "network": "grpc", 
                "security": "tls",
                "tlsSettings": {
                    "alpn": ["h2", "http/1.1"],
                    "certificates": [{
                        "certificateFile": "$CERT_PATH",
                        "keyFile": "$KEY_PATH"
                    }]
                },
                "grpcSettings": { "serviceName": "spicypepper-grpc" }
            }
        }
    ],
    "outbounds": [{ "protocol": "freedom", "tag": "direct" }, { "protocol": "blackhole", "tag": "api" }]
}
EOF
else
    # FALLBACK: Port 8444 with Self-Signed (No Domain provided)
    echo "🔐 No domain provided. Generating Self-Signed Certificates on Port 8444..."
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
                    "alpn": ["h2"],
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
fi

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

echo "🚀 High-Performance Node successfully installed!"
echo "📈 Current Node Telemetry (Live):"
sleep 5
journalctl -u spicy-agent -n 1 --no-pager
echo "--------------------------------------------------"

