# 🌶️ SpicyVPN (StealthVPN) - The Definitive Technical Whitepaper & Operations Manual

Welcome to the absolute, unredacted, and comprehensive documentation for **SpicyVPN** (internally codenamed StealthVPN). This document is designed for systems architects, network engineers, and business operators. It covers the granular mechanics of the network protocols, the full computational lifecycle of the application stack, and the complete multi-year roadmap for converting this platform into a high-margin, enterprise-grade SaaS.

---

## 📖 Master Table of Contents
1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Network Layer: The Hysteria 2 Protocol Deep Dive](#2-network-layer-the-hysteria-2-protocol-deep-dive)
3. [Compute Layer: Architecture & The "Trinity" System](#3-compute-layer-architecture--the-trinity-system)
4. [Data Layer: SQLite, WAL, and Schema Mechanics](#4-data-layer-sqlite-wal-and-schema-mechanics)
5. [Infrastructure & Bare-Metal Configuration](#5-infrastructure--bare-metal-configuration)
6. [The Master/Slave Evolution (Global Edge Networking)](#6-the-masterslave-evolution-global-edge-networking)
7. [Operational Playbook & Disaster Recovery](#7-operational-playbook--disaster-recovery)
8. [Deep System Tuning & Optimizations](#8-deep-system-tuning--optimizations)

---

## 1. Executive Summary & Core Philosophy

### The Threat Landscape
Traditional VPN protocols (OpenVPN, WireGuard, IPsec) were designed for an era of benign networks. Today, state-level actors (The Great Firewall, Roskomnadzor) and enterprise IT departments deploy **Deep Packet Inspection (DPI)** and **Active Probing**. They look for specific packet headers, packet size sequences, and TLS handshakes. When they identify WireGuard or OpenVPN, they don't just throttle it; they drop the packets entirely, block the IP, and occasionally execute active replay attacks to map the proxy infrastructure.

### The SpicyVPN Paradigm
SpicyVPN abandons traditional VPN philosophies. Instead of trying to hide the fact that data is encrypted, SpicyVPN hides the *nature* of the data by perfectly mimicking the most common, unblockable traffic on the internet: **HTTP/3 over QUIC**.

If a firewall attempts to block SpicyVPN, it must also block modern internet browsing (Google, YouTube, Cloudflare), which would break the host network entirely. This concept is known as "collateral damage resistance."

---

## 2. Network Layer: The Hysteria 2 Protocol Deep Dive

SpicyVPN utilizes **Hysteria 2**, a custom network utility written in Golang, built upon a heavily modified QUIC stack.

### A. TCP vs. UDP (The QUIC Advantage)
Standard TCP requires a 3-way handshake (`SYN` -> `SYN-ACK` -> `ACK`), plus additional round-trips for TLS negotiation. This introduces massive latency.
SpicyVPN operates entirely over **UDP** using the **QUIC** protocol. 
- **0-RTT Connection Resumption**: Clients can establish a fully encrypted tunnel and send data in the very first packet.
- **Head-of-Line Blocking Elimination**: In TCP, if packet #3 is dropped, packet #4, #5, and #6 wait in a buffer until #3 is retransmitted. In QUIC, independent streams do not block each other. If a packet carrying a background app's data drops, your active Valorant match's packets continue processing without delay.

### B. Brutal Congestion Control (BBR)
When routing traffic out of restrictive regions, the limiting factor isn't the VPN server's gigabit line; it's the congested international optical cables.
Hysteria utilizes customized congestion control algorithms (like Google's BBR) tuned for aggression. Instead of politely backing off when a packet drops (like standard TCP Reno/CUBIC), SpicyVPN's transport layer assumes the drop is due to a hostile firewall and aggressively retransmits, effectively "bullying" its way to the front of the queue on congested international links. This results in stable 4K streaming even on networks experiencing 30% packet loss.

### C. Masquerading & Obfuscation
Hysteria 2 does not use standard TLS. It intercepts the TLS Client Hello and mimics a legitimate web browser.
- **SNI Spoofing**: The client claims it is connecting to `bing.com` or `microsoft.com`.
- **Fallback Web Server**: If an Active Probing bot (used by China/Iran firewalls) hits our UDP port 8443 without the correct cryptographic UUID password, SpicyVPN silently forwards the request to a real, legitimate website (e.g., pulling a live Bing search page). The firewall receives a valid HTML document, assumes it's a normal web server, and whitelists the IP.

---

## 3. Compute Layer: Architecture & The "Trinity" System

SpicyVPN is not a monolithic application. It is a highly decoupled trinity of services operating in parallel.

### I. The Web Engine (`stealthvpn.service` / Next.js 16)
- **Role**: The control plane and user interface.
- **Authentication**: Utilizes `Auth.js (NextAuth)` configured strictly for Google OAuth 2.0 via `PKCE` (Proof Key for Code Exchange) to prevent cookie-dropping across reverse proxies.
- **The Auth Hook (`POST /api/h2/auth`)**:
  - Hysteria 2 acts as a "dumb" router. It holds no user data.
  - When a user connects, Hysteria pauses the handshake and fires an HTTP POST to `localhost:3000/api/h2/auth` with a JSON payload: `{"auth": "uuid-1234..."}`.
  - Next.js executes a SQL query to verify the UUID exists, `active = 1`, `expiresAt > (unixepoch())`, and `totalUp + totalDown < 35GB`.
  - Next.js returns `{"ok": true, "id": "uuid-1234..."}`. Hysteria uses this `id` to tag all subsequent packets in its RAM.
  - **The Subscription Pipeline (`GET /api/sub?token=...`)**:
    - Validates the user's public token.
    - Base64 encodes the Hysteria config: `hysteria2://uuid@ip:8443?insecure=1&sni=spicypepper.app#SpicyVPN`.
    - Injects `Subscription-Userinfo: upload=X; download=Y; total=Z` headers to natively sync data caps with the client's UI.

  ### II. The VPN Router (`hysteria-server.service`)
  - **Role**: The data plane. A compiled Golang binary running natively on the host Linux kernel.
  - **Network Stack**: Listens on `UDP 8443` for the encrypted QUIC tunnels.
  - **Internal REST API**: Binds exclusively to `127.0.0.1:8080`.
    - `GET /traffic`: Returns a map of all connected IDs and their exact `tx` (transmit) and `rx` (receive) byte counts since the server started.
    - `POST /kick`: Accepts a JSON array of IDs `["uuid-1234"]` to instantly sever live QUIC connections.

  ### III. The Enforcer (`stealthvpn-agent.service` / Node.js)
  - **Role**: The asynchronous reconciliation loop.
  - **Execution Loop**: Every 30,000 milliseconds (30 seconds):
    1. Executes HTTP GET to Hysteria's `localhost:8080/traffic`.
    2. Compares the new payload array against an in-memory cached copy of the previous payload.
    3. Calculates the exact `tx` and `rx` delta for every active UUID.
    4. Commits an `UPDATE vpn_configs SET totalUp = totalUp + rx, totalDown = totalDown + tx, lastActive = (unixepoch())` to SQLite.
    5. Executes a `SELECT` to verify the user hasn't breached the 35GB limit or their timestamp limit.
    6. If breached, it immediately executes an HTTP POST to Hysteria's `/kick` API. The user is disconnected mid-stream and cannot reconnect (blocked by the Auth Hook).

  ---

  ## 4. Multi-Platform Client Ecosystem

  SpicyVPN provides a unified experience across desktop and mobile, ensuring high-speed access regardless of the device.

  ### A. Desktop Client (Windows)
  - **Tech Stack**: Built with **Tauri v2** (Rust backend) and **React 19** (frontend).
  - **Core Engine**: Integrates a `sing-box` sidecar to handle the Hysteria 2 connection.
  - **Features**: 
    - Custom WebGL Dither background for a premium aesthetic.
    - Native TUN interface for full-system routing (gaming/UDP support).
    - Auto-update and local configuration persistence.

  ### B. Android Client
  - **Tech Stack**: Native **Kotlin** application utilizing **Jetpack Compose**.
  - **Core Engine**: Based on a customized `SagerNet/sing-box` core via `libbox.aar`.
  - **Features**:
    - Supports Android 5.0+ with optimized flavors for Play Store and sideloading.
    - Advanced features like Per-App Proxy, Shizuku integration, and Xposed self-hooking modules.
    - Real-time traffic monitoring and profile management.

  ---

  ## 5. Data Layer: SQLite, WAL, and Schema Mechanics
### Why SQLite over PostgreSQL?
For a single-node setup, PostgreSQL introduces unnecessary RAM overhead and network latency. `better-sqlite3` runs directly inside the Node.js process memory space, querying flat files via C++ bindings, resulting in microsecond response times.

### The Locking Problem & Write-Ahead Logging (WAL)
SQLite's default behavior locks the entire database file during a write. Because the Traffic Agent writes every 30 seconds, and users could be fetching data via the Next.js API simultaneously, `SQLITE_BUSY` exceptions would crash the app.
**The Solution**: We enforce `PRAGMA journal_mode = WAL`. Writes do not modify the main `.db` file; they append to a `.db-wal` file. Reads can happen concurrently from the main file. A background checkpoint operation periodically merges the WAL into the main database seamlessly.

### Schema Architecture
- **`users`**: Managed by the NextAuth adapter. (Google OAuth identities).
- **`vpn_configs`**: The core source of truth.
  - `uuid`: The cryptographic password used by the QUIC tunnel.
  - `token`: The public identifier used in the URL bar for subscription fetching.
  - `totalUp` / `totalDown`: High-precision byte integers (e.g., `32212254720` for 30GB).
  - `lastActive`: The heartbeat. The Admin UI queries `WHERE (unixepoch() - lastActive) < 60` to determine who is "Online".
  - `expiresAt`: Enforced strictly at the SQL query level in the Auth Hook and asynchronously in the Traffic Agent.
- **`token_devices`**: Anti-abuse table. Logs the IP address of every device that executes a `GET` request on the `/api/sub` link.

---

## 5. Infrastructure & Bare-Metal Configuration

### Current Node: Oracle Cloud "Always Free" Tier
- **Compute Instance**: Ampere A1 Compute (ARM64 Architecture).
- **Resources**: 4 OCPUs, 24 GB RAM. (Massively over-provisioned for current needs).
- **Network Egress**: 10 Terabytes of outbound traffic per month for free.
- **OS**: Ubuntu Linux.

### Low-Level Firewall Configuration
Oracle's VCN (Virtual Cloud Network) intercepts packets before they hit the Linux kernel.
1. **OCI Cloud Console**: Ingress rules explicitly defined for TCP 80/443 (Web), TCP 3000 (Next.js fallback), and **UDP 8443** (Hysteria QUIC).
2. **Iptables (Host Level)**:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 8443 -j ACCEPT
   sudo netfilter-persistent save
   ```

### Process Management
The entire stack is bound to `systemd` to ensure 100% uptime, automatic restarts on failure, and consolidated logging (`journalctl -u stealthvpn`).

---

## 6. The Multi-Node Architecture & Global Scaling (Edge Networking)

SpicyVPN operates on a highly scalable **Master-Worker (Hub-and-Spoke) topology**, allowing infinite horizontal scaling without user data fragmentation.

### The Master Node (The Central Hub)
- **Role**: The single source of truth. Handles Next.js, Auth, Billing, the Admin Dashboard, and the master SQLite Database (`dev.db`).
- **Dynamic Load Balancing (`GET /api/sub`)**: When a user fetches their subscription, the Master evaluates the `currentLoad` of all active worker nodes. It dynamically generates a `hysteria2://` URI pointing to the least-loaded node, ensuring traffic is evenly distributed globally.
- **Real-Time Orchestration APIs**:
  - `POST /api/h2/auth`: Real-time HTTP Auth Hook. Worker nodes query this endpoint instantly upon connection to validate UUIDs against the 35GB quota and expiration dates.
  - `POST /api/node/sync`: The data reconciliation endpoint. Remote workers send delta traffic updates here every 30 seconds.

### The Worker Nodes (The Data Plane)
- **Role**: Stateless, lightweight edge servers running Hysteria 2 and a Node.js `traffic-agent.js`. They hold zero user data locally.
- **Automated Deployment**: New nodes are deployed via a 1-line bash script generated from the Admin Panel, which automatically configures the API keys, installs Hysteria 2, and starts the sync agent.

### Data Synchronization & Activity Tracking Mechanics
Scaling introduces the challenge of tracking active users across multiple stateless servers. SpicyVPN solves this using a precise Delta-Sync model and dual-window activity tracking:

1. **Delta Traffic Calculation**: 
   - Every 30 seconds, `traffic-agent.js` polls the local Hysteria 2 server.
   - It calculates the *delta* (increase) in RX/TX bytes since the last poll.
   - It sends this delta to the Master's `/api/node/sync`. The Master adds this to the user's `totalUp` and `totalDown` in the database.
   - *Resilience*: If a node restarts and counters reset to 0, the delta logic detects the negative drop and safely resets its baseline without double-counting traffic.

2. **Active Load vs. Live Connections**:
   - **Active Load (30s Window)**: Represents instantaneous server stress. A user is only counted towards the Active Load if their RX/TX delta was greater than 1KB in the last 30-second sync window. Idle background connections are ignored.
   - **Live Connections (90s Window)**: Represents the active user base. The dashboard displays a "Green Dot" for any unique user who has transferred data in the last 90 seconds (`lastActive`). 
   - *The Result*: It is normal and mathematically correct for "Live Connections" to be higher than the sum of the "Active Load." Active Load counts people *currently downloading*, while Live Connections counts people *sitting in an active session*.

3. **Quota Enforcement (The Kick List)**:
   - During the 30-second sync, if the Master detects a user has crossed the 35GB limit or expired, it returns an array of UUIDs (`kick_users`). The worker node's agent immediately fires an API call to Hysteria to terminate those specific QUIC sessions mid-stream.

---

## 7. Operational Playbook & Disaster Recovery

### Log Auditing Commands
- **Web Engine Logs**: `sudo journalctl -u stealthvpn -f`
- **Traffic Agent Logs**: `sudo journalctl -u stealthvpn-agent -f`
- **Hysteria Router Logs**: `sudo journalctl -u hysteria-server -f`

### Database Repair (If WAL Corrupts)
If the server suffers a hard power loss and the SQLite WAL file desynchronizes:
```bash
cd /home/ubuntu/.openclaw/workspace/stealthvpn/prisma
sqlite3 dev.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Emergency "Kill Switch"
If the Master database is compromised or a zero-day exploit is found in the VPN router, instantly sever all global connections by halting the systemd services:
```bash
sudo systemctl stop hysteria-server stealthvpn stealthvpn-agent
```

---

## 8. Deep System Tuning & Optimizations

Here is the precise, live, and verified snapshot of every configuration actively running on the server right now.

### 🐧 1. Linux OS & Kernel Layer (`sysctl`)
*   **Congestion Control:** `net.ipv4.tcp_congestion_control = bbr`
    *   *(BBR is enabled at the OS layer, but the VPN core utilizes Brutal for precise bandwidth pacing.)*
*   **Queue Discipline:** `net.core.default_qdisc = fq_codel`
    *   *(Fair Queuing with Controlled Delay optimizes flow management and reduces bufferbloat for mixed UDP/TCP traffic.)*
*   **IP Forwarding:** `net.ipv4.ip_forward = 1`
    *   *(Enabled to support advanced TUN/TAP routing and system-wide proxy modes.)*
*   **File Descriptor Limit:** `ulimit -n 1048576`
    *   *(Massively increased to 1,048,576 to handle thousands of concurrent QUIC sessions and database connections.)*
*   **Maximum Memory Buffers:**
    *   `net.core.rmem_max = 33554432` (32 MB)
    *   `net.core.wmem_max = 33554432` (32 MB)
    *   *(The absolute ceiling the OS will allow for a single socket. Massively expanded to support Brutal's pacing requirements.)*
*   **Default Memory Buffers:**
    *   `net.core.rmem_default = 131072` (128 KB)
    *   `net.core.wmem_default = 131072` (128 KB)
    *   *(The starting buffer for new connections. Keeping this low prevents the initial massive spikes in jitter when a connection begins.)*
*   **Minimum UDP Memory:**
    *   `net.ipv4.udp_rmem_min = 16384`
    *   `net.ipv4.udp_wmem_min = 16384`

### 🛡️ 2. Network Firewall & Routing (`iptables`)
*   **Port Hopping (Active):**
    *   `udp dpts:20000:50000 redir ports 8443`
    *   *(The kernel is actively intercepting any UDP packet arriving on ports 20,000 through 50,000 and silently forwarding it to Hysteria on port 8443.)*

### ⚙️ 3. Hysteria 2 Core Config (`/etc/hysteria/config.yaml`)
*   **Brutal Congestion Control Activation:** `ignoreClientBandwidth: false`
    *   *(The server honors the client's speed requests, which is required to activate Brutal's active pacing mechanism.)*
*   **Server Bandwidth Limits:**
    *   `up: 8 mbps` *(Server's max send = Client's max download).*
    *   `down: 5 mbps` *(Server's max receive = Client's max upload).*
    *   *(Enforces a hard ceiling. Even if a user attempts to request 1Gbps, the server will force them down to 8/5 Mbps, triggering Brutal to pace at exactly these speeds.)*
*   **Listening Port & Camouflage:**
    *   `listen: :8443`
    *   `alpn: [h3]` *(Posing as HTTP/3 web traffic.)*
*   **Massive QUIC Buffers (BDP Tuned):**
    *   `initStreamReceiveWindow: 8388608` (8 MB)
    *   `maxStreamReceiveWindow: 8388608` (8 MB)
    *   `initConnReceiveWindow: 20971520` (20 MB)
    *   `maxConnReceiveWindow: 20971520` (20 MB)
    *   *(Massively expanded buffers designed to absorb network jitter and allow Brutal to constantly saturate the 8/5 Mbps connection without stalling, even on high-latency international links.)*
*   **Fixed MTU:** `mtu: 1350`
    *   *(Forced at 1350 to prevent packet fragmentation, specifically optimizing UDP traffic for low-latency gaming.)*
*   **QUIC-in-QUIC Blocking (HTTP/3 Fallback):**
    *   `acl: inline: [ - reject(all, udp/443) ]`
    *   *(Actively blocks UDP 443 inside the tunnel. This forces client browsers to fall back to HTTP/2 over TCP. Hysteria can optimize TCP traffic via Brutal/BBR, but cannot optimize raw UDP. This eliminates UDP bufferbloat and reserves the UDP lane exclusively for games and voice calls.)*
*   **IPv6 Blackhole Remediation (Forced IPv4):**
    *   `outbounds: [ {name: ipv4_only, type: direct, direct: {mode: "4"}} ]`
    *   `acl: inline: [ - ipv4_only(all) ]`
    *   *(Intercepts all outbound requests and forces them exclusively over IPv4 to prevent blackholing on networks lacking IPv6 routing.)*
*   **Zero-Trust Auth:**
    *   `url: http://127.0.0.1:3000/api/h2/auth` *(Validates UUIDs against Next.js).*
*   **Masquerade:**
    *   `url: https://bing.com` *(Serves Bing if probed by censors).*

### 🟢 4. System Services (`systemd`)
All three pillars of your stack are confirmed to be **ACTIVE** and running:
*   **`stealthvpn`**: The Next.js web application.
*   **`hysteria-server`**: The VPN core.
    *   **Real-Time Priority:** Runs with `CPUSchedulingPolicy=rr` and `CPUSchedulingPriority=99` via a drop-in override. This guarantees the CPU prioritizes VPN packet encryption/decryption, drastically reducing latency jitter under heavy system load.
*   **`stealthvpn-agent`**: The Node.js traffic monitor and active enforcer.