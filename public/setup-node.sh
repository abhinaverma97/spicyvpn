#!/bin/bash
# SpicyVPN - Automated Slave Node Provisioning Script
# Run this script on a fresh Ubuntu VPS to join it to the Master cluster.

set -e

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "====================================="
echo " SpicyVPN Slave Node Setup "
echo "====================================="

MASTER_URL=$1
API_KEY=$2

if [ -z "$MASTER_URL" ] || [ -z "$API_KEY" ]; then
    echo "Usage: curl -sSL https://yourdomain.com/setup-node.sh | bash -s -- <MASTER_URL> <API_KEY>"
    exit 1
fi

echo "Using Master URL: $MASTER_URL"

echo "1. Applying Deep Kernel Tuning..."
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
EOF
sysctl -p /etc/sysctl.d/99-spicyvpn.conf

echo "2. Raising File Descriptor Limits..."
echo "* soft nofile 1048576" >> /etc/security/limits.conf
echo "* hard nofile 1048576" >> /etc/security/limits.conf
echo "fs.file-max = 1048576" >> /etc/sysctl.conf
sysctl -p

echo "3. Configuring iptables Port Hopping..."
apt-get update && apt-get install -y iptables-persistent
iptables -t nat -A PREROUTING -p udp --dport 20000:50000 -j REDIRECT --to-ports 8443
netfilter-persistent save

echo "4. Installing Hysteria 2..."
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

# Note: In production you'd need valid certs. This creates self-signed for testing.
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /etc/hysteria/server.key -out /etc/hysteria/server.crt -subj "/CN=spicypepper.app"

chown -R hysteria:hysteria /etc/hysteria

systemctl enable hysteria-server
systemctl restart hysteria-server

echo "5. Installing Node.js and Slave Agent..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

cat << EOF > /root/slave-agent.js
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
      await axios.post(\`\${HYSTERIA_API_URL}/kick\`, kickUsers);
      console.log(\`Kicked users: \${kickUsers.join(', ')}\`);
    }
  } catch (err) {
    console.error("Sync Error:", err.message);
  }
}

console.log("Slave Agent Started.");
setInterval(sync, INTERVAL_MS);
EOF

cd /root && npm init -y && npm install axios
pm2 start /root/slave-agent.js --name slave-agent
pm2 save
pm2 startup

echo "====================================="
echo " Node setup complete! It is now syncing with the Master."
echo "====================================="
