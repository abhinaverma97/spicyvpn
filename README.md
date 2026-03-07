# 🌶️ SpicyVPN (StealthVPN)

A high-performance, stealthy, and user-friendly VPN management platform built on the **Hysteria 2** protocol and **Next.js**. Designed for ultra-low latency (great for gaming) and bypassing restrictive networks.

## ✨ Features

- **Hysteria 2 Core**: Powered by the modern, UDP-based Hysteria 2 protocol. Masks your VPN traffic to look like standard HTTP/3 traffic to bypass deep packet inspection (DPI).
- **Automated User Management**: Google OAuth login. Users automatically get a secure 30-day, 30GB quota upon first login.
- **Client Auto-Sync**: The `/api/sub` subscription link sends `Profile-Update-Interval` and real-time quota data to compatible clients (Hiddify, v2rayN), automatically updating progress bars.
- **Active Traffic Monitoring**: A Node.js background agent polls the Hysteria 2 REST API every 30 seconds to track `tx` and `rx` data.
- **Strict Limit Enforcement**: The background agent aggressively checks quotas and expiration dates, instantly firing `/kick` requests to disconnect active users the moment they exceed their limits.
- **Admin Dashboard**: Real-time server resource monitoring (CPU, RAM, Disk), live connection counts, and user management (delete, view usage, sort by online status). Secured behind `ADMIN_EMAIL`.

## 🏗️ Architecture

1.  **Frontend (Next.js 16)**: User dashboard, admin panel, and OAuth integrations.
2.  **API (Next.js Server Actions/Routes)**:
    -   `/api/h2/auth`: The HTTP authentication hook that the Hysteria 2 core queries to validate a user's connection.
    -   `/api/sub`: Generates the Base64 encoded Hysteria link and quota headers for client apps.
3.  **Database (SQLite via better-sqlite3)**: Fast, local database with WAL mode enabled to support concurrent reads/writes from the web API and the background traffic agent.
4.  **VPN Core (Hysteria 2)**: Runs natively, listening on UDP `8443`. Uses an internal HTTP API (`8080`) to report traffic stats and accept `/kick` commands.
5.  **Traffic Agent (`traffic-agent.js`)**: A background service that bridges Hysteria 2 and the SQLite database.

## 🚀 Deployment

### Prerequisites

- A Linux VPS (Ubuntu/Debian recommended).
- Node.js 20+ and npm.
- Hysteria 2 binary installed in `/usr/local/bin/hysteria`.
- Valid SSL certificates for your domain.

### 1. Configure Next.js
Rename `.env.example` to `.env` and fill in the details:
```env
AUTH_SECRET="your_secure_random_string"
AUTH_GOOGLE_ID="your_google_oauth_client_id"
AUTH_GOOGLE_SECRET="your_google_oauth_client_secret"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NEXTAUTH_URL="https://yourdomain.com"
AUTH_URL="https://yourdomain.com"
AUTH_TRUST_HOST=true
ADMIN_EMAIL="admin@yourdomain.com"
NEXT_PUBLIC_ADMIN_EMAIL="admin@yourdomain.com"
DATABASE_URL="file:///path/to/your/repo/prisma/dev.db"
```

### 2. Configure Hysteria 2 (`/etc/hysteria/config.yaml`)
```yaml
listen: :8443

# High-Performance Extras
ignoreClientBandwidth: true
quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s

tls:
  cert: /etc/hysteria/server.crt
  key: /etc/hysteria/server.key

auth:
  type: http
  http:
    url: http://127.0.0.1:3000/api/h2/auth

trafficStats:
  listen: 127.0.0.1:8080

masquerade:
  type: proxy
  proxy:
    url: https://bing.com
    rewriteHost: true
```

### 3. Setup Systemd Services
You will need three systemd services:
1.  `stealthvpn.service`: Runs `npm run start`.
2.  `hysteria-server.service`: Runs `hysteria server -c /etc/hysteria/config.yaml`.
3.  `stealthvpn-agent.service`: Runs `node traffic-agent.js`.

### 4. Build and Run
```bash
npm install
node scripts/init-db.js # Initialize SQLite schema
npm run build
sudo systemctl restart stealthvpn hysteria-server stealthvpn-agent
```

## 📱 Supported Clients

Users can connect using the **Hiddify** app (available on Android, iOS, Windows, Mac, and Linux). They simply copy their subscription link from the dashboard and use "Add from clipboard".

For gaming (e.g., Valorant, Discord), users should enable **VPN Mode** in Hiddify to route all UDP traffic through the proxy.

## ⚡ Performance Optimizations

To ensure extreme speed and ultra-low latency for gaming and heavy downloads, the following system-level optimizations have been applied to the host server:

1.  **BBR Congestion Control**: The Linux kernel is configured to use Google's BBR (`net.ipv4.tcp_congestion_control=bbr`) and `fq` queueing discipline to maximize throughput and minimize packet loss over long-distance links.
2.  **Maximized UDP Buffers**: Since Hysteria 2's QUIC protocol relies heavily on UDP, the kernel's UDP read/write buffers (`net.core.rmem_max` and `net.core.wmem_max`) have been expanded to 67MB. This prevents packet dropping during high-bandwidth bursts.
3.  **ALPN Hardcoding**: The Hysteria 2 configuration explicitly defines the Application-Layer Protocol Negotiation (ALPN) as `h3` (HTTP/3). This bypasses the standard negotiation handshake, saving a full round-trip (RTT) and connecting clients slightly faster.

## 🛡️ License
Private / Proprietary.
