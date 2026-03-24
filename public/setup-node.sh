#!/bin/bash
# SpicyVPN - Ultimate Slave Node Provisioning Script v2.3
# Optimized for Ubuntu 22.04+ (ARM64 & x86_64)

set -e
export DEBIAN_FRONTEND=noninteractive

# Setup Logging
LOG_FILE="/var/log/spicy-setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "================================================="
echo " 🌶️  SpicyVPN Slave Node Provisioning v2.3 "
echo " Started at: $(date)"
echo "================================================="

# 1. Core Sanity Checks
if [ "$EUID" -ne 0 ]; then
  echo "❌ ERROR: Please run as root (use sudo)"
  exit 1
fi

MASTER_URL_INPUT=$1
API_KEY=$2

if [ -z "$MASTER_URL_INPUT" ] || [ -z "$API_KEY" ]; then
    echo "Usage: sudo bash setup-node.sh <MASTER_URL> <API_KEY>"
    echo "Example: sudo bash setup-node.sh https://spicypepper.app YOUR_API_KEY"
    exit 1
fi

# Normalize Master URL (Remove trailing slash and ensure protocol)
MASTER_URL=$(echo "$MASTER_URL_INPUT" | sed 's:/*$::')
if [[ ! "$MASTER_URL" =~ ^https?:// ]]; then
    MASTER_URL="https://$MASTER_URL"
fi

echo "Master URL:  $MASTER_URL"
echo "Node IP:     $(curl -s --connect-timeout 5 https://ifconfig.me || echo "Unknown")"
echo "Architecture: $(uname -m)"
echo "Log File:    $LOG_FILE"
echo "================================================="

# Trap for cleanup on error
cleanup() {
  if [ $? -ne 0 ]; then
    echo "❌ ERROR: Installation failed. Check $LOG_FILE for details."
  fi
}
trap cleanup EXIT

# Function: Wait for apt lock (Robust)
wait_for_apt() {
  echo "⏳ Waiting for package manager lock..."
  local timeout=300
  local elapsed=0
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 ; do 
    if [ $elapsed -ge $timeout ]; then
      echo "❌ ERROR: Apt lock timeout after 5 minutes. Please check for hung processes."
      exit 1
    fi
    sleep 5
    ((elapsed+=5))
  done
  echo "✅ Package manager ready."
}

# 2. Pre-flight: Check Master Reachability
echo "🔍 Verifying connection to Master..."
if ! curl -s --head --request GET --connect-timeout 10 "$MASTER_URL" > /dev/null; then
  echo "❌ ERROR: Cannot reach Master URL: $MASTER_URL"
  echo "Please check your network and ensure the Master server is online."
  exit 1
fi
echo "✅ Master is reachable."

# 3. System Dependencies
echo "📦 Installing system dependencies..."
wait_for_apt
apt-get update
apt-get install -y curl openssl iptables-persistent socat jq ca-certificates gnupg net-tools wget

# 4. Node.js Installation (Standardized)
if ! command -v node &> /dev/null || ! node -v | grep -q "v20"; then
    echo "🟢 Installing/Updating Node.js (v20)..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    wait_for_apt
    apt-get update
    apt-get install -y nodejs
else
    echo "✅ Node.js already installed: $(node -v)"
fi

# 5. Deep Kernel Tuning
echo "🚀 Applying kernel optimizations..."
cat << 'EOF' > /etc/sysctl.d/99-spicyvpn.conf
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq_codel
net.ipv4.ip_forward = 1
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432
net.core.rmem_default = 131072
net.core.wmem_default = 131072
net.ipv4.udp_rmem_min = 16384
net.ipv4.udp_wmem_min = 16384
fs.file-max = 1048576
EOF
sysctl -p /etc/sysctl.d/99-spicyvpn.conf || true

echo "📂 Increasing file descriptor limits..."
cat << 'EOF' > /etc/security/limits.d/spicyvpn.conf
* soft nofile 1048576
* hard nofile 1048576
root soft nofile 1048576
root hard nofile 1048576
EOF

# 6. Firewall & Port Hopping (Idempotent)
echo "🛡️ Configuring firewall rules..."

# Helper to add iptables rules only if they don't exist
safe_iptables_input() {
  iptables -C INPUT "$@" >/dev/null 2>&1 || iptables -I INPUT 1 "$@"
}

safe_iptables_nat() {
  iptables -t nat -C PREROUTING "$@" >/dev/null 2>&1 || iptables -t nat -A PREROUTING "$@"
}

safe_iptables_input -p udp --dport 8443 -j ACCEPT
safe_iptables_input -p udp --dport 20000:50000 -j ACCEPT
safe_iptables_nat -p udp --dport 20000:50000 -j REDIRECT --to-ports 8443

# Disable UFW as it often conflicts with manual iptables
if command -v ufw &> /dev/null; then
    ufw disable || true
fi

# Save rules
if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save || true
fi

# 7. Hysteria 2 Core Installation
echo "🌐 Installing/Updating Hysteria 2..."
# Official Hysteria 2 install script handles updates
bash <(curl -fsSL https://get.hy2.sh/)

mkdir -p /etc/hysteria
cat << EOF > /etc/hysteria/config.yaml
listen: :8443
ignoreClientBandwidth: false
bandwidth:
  up: 8 mbps
  down: 5 mbps
quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
  mtu: 1350
tls:
  cert: /etc/hysteria/server.crt
  key: /etc/hysteria/server.key
  alpn:
    - h3
auth:
  type: http
  http:
    url: ${MASTER_URL}/api/node/auth
    header:
      Content-Type: application/json
trafficStats:
  listen: 127.0.0.1:8080
masquerade:
  type: proxy
  proxy:
    url: https://bing.com
    rewriteHost: true
outbounds:
  - name: ipv4_only
    type: direct
    direct:
      mode: "4"
acl:
  inline:
    - reject(geosite:category-pt)
    - reject(*, tcp/6881-6889)
    - reject(*, udp/6881-6889)
    - ipv4_only(all)
EOF

# Generate Self-Signed Cert if missing
if [ ! -f /etc/hysteria/server.crt ] || [ ! -f /etc/hysteria/server.key ]; then
    echo "🔑 Generating self-signed SSL certificates..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/hysteria/server.key -out /etc/hysteria/server.crt \
    -subj "/CN=spicy-node"
fi

# Fix permissions
id -u hysteria &>/dev/null || useradd -r -s /bin/false hysteria
chown -R hysteria:hysteria /etc/hysteria

systemctl daemon-reload
systemctl enable hysteria-server
systemctl restart hysteria-server

# 8. Slave Agent (Systemd Service)
echo "🤖 Setting up Slave Agent Service..."
mkdir -p /opt/spicyvpn
cat << EOF > /opt/spicyvpn/slave-agent.js
const axios = require('axios');
const MASTER_API_URL = "${MASTER_URL}";
const API_KEY = "${API_KEY}";
const HYSTERIA_API_URL = "http://127.0.0.1:8080";
const INTERVAL_MS = 30000;

async function sync() {
  try {
    const res = await axios.get(\`\${HYSTERIA_API_URL}/traffic\`, { timeout: 5000 });
    const traffic = res.data || {};

    const syncRes = await axios.post(\`\${MASTER_API_URL}/api/node/sync\`, {
      apiKey: API_KEY,
      traffic: traffic
    }, { timeout: 10000 });

    const kickUsers = syncRes.data.kick_users;
    if (kickUsers && kickUsers.length > 0) {
      try {
        await axios.post(\`\${HYSTERIA_API_URL}/kick\`, kickUsers);
        console.log(\`[\${new Date().toISOString()}] Kicked users: \${kickUsers.join(', ')}\`);
      } catch (kickErr) {
        console.error(\`[\${new Date().toISOString()}] Kick Error:\`, kickErr.message);
      }
    }
  } catch (err) {
    console.error(\`[\${new Date().toISOString()}] Sync Error:\`, err.message);
  }
}

console.log("SpicyVPN Slave Agent Started.");
sync();
setInterval(sync, INTERVAL_MS);
EOF

# Install Local Dependencies
cd /opt/spicyvpn
if [ ! -f package.json ]; then
    npm init -y >/dev/null
fi
npm install axios --no-audit --no-fund --silent

# Create Systemd Service for Agent
cat << EOF > /etc/systemd/system/spicy-agent.service
[Unit]
Description=SpicyVPN Slave Traffic Agent
After=network.target hysteria-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/spicyvpn
ExecStart=$(which node) /opt/spicyvpn/slave-agent.js
Restart=always
RestartSec=10
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable spicy-agent
systemctl restart spicy-agent

# 9. Diagnostics & Verification
echo "================================================="
echo " 🏁 Final Diagnostics & Verification "
echo "================================================="
sleep 5

# Check Services
if systemctl is-active --quiet hysteria-server; then echo "✅ Hysteria 2 Service: RUNNING"; else echo "❌ Hysteria 2 Service: FAILED"; fi
if systemctl is-active --quiet spicy-agent; then echo "✅ Slave Agent Service: RUNNING"; else echo "❌ Slave Agent Service: FAILED"; fi

# Check Local Hysteria API
if curl -s http://127.0.0.1:8080/traffic > /dev/null; then
  echo "✅ Local Hysteria API: RESPONDING"
else
  echo "❌ Local Hysteria API: NOT RESPONDING"
fi

# Verification: Connect to Master via Sync API
echo "🔗 Verifying Master Sync Connection..."
SYNC_CHECK=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"apiKey\": \"$API_KEY\", \"traffic\": {}}" "$MASTER_URL/api/node/sync")
if echo "$SYNC_CHECK" | grep -q '"ok":true'; then
  echo "✅ Master Connection: AUTHENTICATED & SYNCED"
else
  echo "❌ Master Connection: FAILED ($SYNC_CHECK)"
  echo "Please verify your API Key and Master URL."
fi

echo "================================================="
echo " 🚀 SETUP COMPLETE! "
echo " Check $LOG_FILE for full installation logs."
echo "================================================="
