#!/bin/bash
set -e

# SpicyVPN Node Install Script
# Usage: curl -sL https://spicypepper.app/api/node/install.sh | sudo bash -s -- --key <API_KEY> --master <MASTER_URL>

echo "🌶️ SpicyVPN Node Installer - Starting..."

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

# Update and install dependencies
echo "🛠️ Installing dependencies..."
apt-get update && apt-get install -y curl unzip jq iptables-persistent

# Oracle Cloud / Ubuntu Firewall setup
echo "🛡️ Configuring Firewall (iptables)..."
# Intersert rules at the top to bypass default REJECT rules on OCI
iptables -I INPUT 1 -p icmp -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 8444 -j ACCEPT
iptables -I INPUT 1 -p udp --dport 8444 -j ACCEPT
# Also allow standard web ports just in case
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT

# Save the rules so they persist across reboots
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save
    netfilter-persistent reload
fi

# Install Xray
echo "📦 Installing Xray-core..."
XRAY_VERSION=$(curl -s https://api.github.com/repos/XTLS/Xray-core/releases/latest | jq -r .tag_name)
curl -L -o xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip"
mkdir -p /usr/local/etc/xray /usr/local/bin
unzip -o xray.zip -d /usr/local/bin
rm xray.zip

# Create basic Xray config
cat <<EOF > /usr/local/etc/xray/config.json
{
    "log": { "loglevel": "info" },
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
                "network": "grpc", "security": "none",
                "grpcSettings": { "serviceName": "spicypepper-grpc" }
            }
        }
    ],
    "outbounds": [{ "protocol": "freedom", "tag": "direct" }, { "protocol": "blackhole", "tag": "api" }]
}
EOF

# Install SpicyAgent (Simplified for this script - ideally a standalone binary or JS script)
echo "🔥 Setting up SpicyAgent..."
mkdir -p /etc/spicyvpn
echo "$NODE_KEY" > /etc/spicyvpn/key
echo "$MASTER_URL" > /etc/spicyvpn/master

cat <<'EOF' > /usr/local/bin/spicy-agent
#!/bin/bash
KEY=$(cat /etc/spicyvpn/key)
MASTER=$(cat /etc/spicyvpn/master)
XRAY_API="127.0.0.1:10085"

previous_stats="{}"

while true; do
    # 1. Sync Users
    SYNC=$(curl -s -H "Authorization: Bearer $KEY" "$MASTER/api/node/sync")
    if [ $? -eq 0 ]; then
        USERS=$(echo "$SYNC" | jq -r '.users[] | .uuid + " " + .token')
        # Here we would normally use 'xray api adu/rmu' to sync
        # For this script, we'll just log and assume Xray is updated via a sidecar or direct API call
    fi

    # 2. Collect Stats
    # We calculate CPU usage by taking a 1-second delta from /proc/stat to get the true current load
    read cpu user nice system idle iowait irq softirq steal guest < /proc/stat
    sleep 1
    read cpu user2 nice2 system2 idle2 iowait2 irq2 softirq2 steal2 guest2 < /proc/stat
    prev_idle=$((idle + iowait))
    idle_total=$((idle2 + iowait2))
    prev_non_idle=$((user + nice + system + irq + softirq + steal))
    non_idle=$((user2 + nice2 + system2 + irq2 + softirq2 + steal2))
    prev_total=$((prev_idle + prev_non_idle))
    total=$((idle_total + non_idle))
    total_diff=$((total - prev_total))
    idle_diff=$((idle_total - prev_idle))
    CPU=$(awk -v t=$total_diff -v i=$idle_diff 'BEGIN { if(t>0) printf "%.1f\n", (t-i)*100/t; else print "0.0" }')
    
    RAM=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    
    # 3. Collect Traffic Stats from Xray
    XRAY_STATS=$(xray api statsquery --server=$XRAY_API 2>/dev/null || echo '{"stat":[]}')
    TRAFFIC_STATS=$(echo "$XRAY_STATS" | jq -c 'if .stat == null then {} else reduce .stat[] as $item ({}; ($item.name | split(">>>")) as $parts | if $parts[0] == "user" then .[$parts[1]][$parts[3]] = ($item.value | tonumber) else . end) end')
    if [ -z "$TRAFFIC_STATS" ]; then TRAFFIC_STATS="{}"; fi
    
    # 4. Report back
    curl -s -X POST -H "Authorization: Bearer $KEY" \
         -H "Content-Type: application/json" \
         -d "{\"cpuUsage\": $CPU, \"ramUsage\": $RAM, \"trafficStats\": $TRAFFIC_STATS}" \
         "$MASTER/api/node/report"

    sleep 10
done
EOF
chmod +x /usr/local/bin/spicy-agent

# Systemd Services
cat <<EOF > /etc/systemd/system/xray.service
[Unit]
Description=Xray Service
After=network.target nss-lookup.target
[Service]
User=root
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

cat <<EOF > /etc/systemd/system/spicy-agent.service
[Unit]
Description=SpicyVPN Agent
After=xray.service
[Service]
ExecStart=/usr/local/bin/spicy-agent
Restart=always
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xray spicy-agent
systemctl start xray spicy-agent

echo "🚀 Node successfully installed and connected to Master!"
