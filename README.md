# 🌶️ SpicyVPN (StealthVPN) - Comprehensive System Documentation

SpicyVPN is an enterprise-grade, stealth-focused VPN management platform designed to bypass the most aggressive network restrictions globally (including Deep Packet Inspection and strict corporate firewalls) while delivering uncompromising speed and ultra-low latency for competitive gaming and 4K streaming.

This document serves as the absolute source of truth for the project, covering deep technical architecture, deployment nuances, economic models, and future scalability blueprints.

---

## 📖 Table of Contents
1. [The Problem & The Protocol](#1-the-problem--the-protocol)
2. [Deep Architectural Breakdown](#2-deep-architectural-breakdown)
3. [Database Schema & Data Flow](#3-database-schema--data-flow)
4. [Infrastructure & Network Setup](#4-infrastructure--network-setup)
5. [Cost Economics & Scaling Analysis](#5-cost-economics--scaling-analysis)
6. [Multi-Node (Master/Slave) Evolution](#6-multi-node-masterslave-evolution)
7. [Product Roadmap & Monetization Strategy](#7-product-roadmap--monetization-strategy)

---

## 1. The Problem & The Protocol

### Why Traditional VPNs Fail
Legacy protocols like **OpenVPN**, **WireGuard**, and **IPsec** use easily identifiable packet signatures. Modern firewalls (like the Great Firewall or corporate DPI appliances) analyze these headers, recognize the VPN traffic, and either throttle the connection to unusable speeds or outright drop the packets. 

### The Solution: Hysteria 2 (QUIC + Obfuscation)
SpicyVPN is powered by the **Hysteria 2** protocol, which fundamentally shifts how traffic is transmitted:
- **QUIC / UDP Transport**: It operates entirely over UDP using a customized QUIC protocol. This completely bypasses TCP handshake overhead, resulting in dramatically lower latency (ping) and significantly faster connection establishment.
- **Congestion Control**: It utilizes brutal, aggressive congestion control algorithms (like BBR) that effectively "bully" their way through congested international routing links to maintain high speeds.
- **Camouflage / Masquerading**: Hysteria 2 traffic is mathematically indistinguishable from normal **HTTP/3** web traffic. To a firewall analyzing the packets, a user connecting to SpicyVPN looks exactly like a user securely browsing `https://bing.com` or watching a YouTube video. 

---

## 2. Deep Architectural Breakdown

SpicyVPN operates as a tightly integrated trinity of localized services.

### A. The Web Engine (`stealthvpn.service` / Next.js)
- **Framework**: Next.js 16 (App Router) running on Node.js.
- **Role**: The central nervous system. It serves the user-facing React dashboard, handles Google OAuth 2.0 (via `next-auth`), and acts as the gatekeeper.
- **The Auth Hook (`POST /api/h2/auth`)**: Hysteria 2 does not have a built-in user database. Instead, every time a client attempts to connect, the Hysteria core sends an internal HTTP POST request to this endpoint containing the client's UUID. Next.js queries the database. If the UUID is valid, active, and has remaining data, Next.js returns `{"ok": true, "id": "uuid-1234"}`.
- **The Subscription API (`GET /api/sub?token=...`)**: Generates Base64 encoded connection strings for clients. Crucially, it injects custom HTTP headers (`Profile-Update-Interval: 1`, `Subscription-Userinfo: upload=X; download=Y; total=Z`) forcing client apps like Hiddify to auto-sync usage progress bars in the background every hour.

### B. The VPN Router (`hysteria-server.service`)
- **Role**: The actual traffic router. A compiled, lightweight Golang binary running natively on the host.
- **Network**: Listens on `UDP 8443` for inbound encrypted client tunnels.
- **Internal API**: Exposes a private REST API on `TCP 127.0.0.1:8080`. This API provides real-time byte counters (`tx` and `rx`) for every connected `id` and accepts external commands to forcibly terminate specific user sessions.

### C. The Enforcer (`stealthvpn-agent.service` / `traffic-agent.js`)
- **Role**: The bridge between the stateless VPN router and the stateful Web Engine.
- **The Event Loop (Every 30 Seconds)**:
  1. Queries Hysteria's `TCP 8080/traffic` endpoint.
  2. Calculates the delta (bytes used in the last 30s) by comparing the new payload against the previous payload stored in RAM.
  3. Executes an `UPDATE` SQL statement to increment `totalUp` and `totalDown` in the database.
  4. **Active Severing**: Evaluates the new total against the `TRAFFIC_LIMIT` (30GB) and checks the `expiresAt` timestamp. If a user exceeds *either* limit, the agent instantly executes an HTTP `POST` to Hysteria's `/kick` API, forcefully terminating the active QUIC tunnel.

---

## 3. Database Schema & Data Flow

### The Engine: SQLite (Write-Ahead Logging)
We utilize `better-sqlite3`. Because the Web Engine is constantly reading (users checking dashboards) and the Traffic Agent is constantly writing (every 30 seconds), standard SQLite would encounter `SQLITE_BUSY` locks. We enforce `PRAGMA journal_mode = WAL`, allowing concurrent reads and writes.

### Core Tables
1. **`users`**: Managed by NextAuth. Stores `id`, `email`, `name`, and timestamps.
2. **`vpn_configs`**: The core operational table.
   - `userId` (Foreign Key -> users.id)
   - `uuid` (The secret password Hysteria uses to authenticate)
   - `token` (The public token used to fetch the subscription config)
   - `totalUp` / `totalDown` (Running byte counters updated by the agent)
   - `lastActive` (Epoch timestamp updated by the agent. If `now - lastActive < 60s`, the user is considered "Live" on the Admin panel).
   - `expiresAt` (Epoch timestamp for the 30-day limit).
3. **`token_devices`**: Tracks the IP addresses of devices fetching the subscription links to monitor potential link-sharing abuse.

---

## 4. Infrastructure & Network Setup

### Current Environment
- **Host**: Oracle Cloud Infrastructure (OCI) "Always Free" Tier.
- **Compute**: Ampere A1 (ARM64) processor.
- **Networking**: Oracle's default Virtual Cloud Network (VCN) blocks all ports. You must explicitly open `TCP 80, 443, 3000` and `UDP 8443` in the OCI Security List, *and* open them in the local `iptables` or `ufw` firewall on the Ubuntu instance.

### Certificate Management
Hysteria 2 requires valid SSL certificates to successfully masquerade as HTTPS traffic.
- Currently relies on standard `.crt` and `.key` files. 
- **Warning**: Do not route Hysteria's `UDP 8443` traffic through Cloudflare's standard proxy. Cloudflare proxies HTTP/TCP traffic. Proxying the UDP QUIC traffic will break the tunnel. DNS must be set to "DNS Only" (Grey Cloud) for the domain pointing to the VPN core.

---

## 5. Cost Economics & Scaling Analysis

### Current Phase: $0 / Month
Running on Oracle's Free Tier provides immense value:
- 4 ARM Cores / 24GB RAM (Massive overkill for Next.js + SQLite).
- **10 TB of Outbound Bandwidth / Month (Free)**.

### Growth Phase: Bandwidth is the Only Metric that Matters
VPNs are intensely bandwidth-heavy. CPU and RAM costs are negligible. When scaling beyond Oracle, you must evaluate hosts strictly on **Egress (Outbound) pricing**.

#### The Math
If 1 user = 30GB/month. 
1,000 active users = **30,000 GB (30 TB) of traffic**.

#### Provider Comparison for 30TB of Traffic:
- **AWS / Google Cloud**: ~$0.09 per GB = **$2,700 / month**. *(Do not use for VPNs).*
- **DigitalOcean**: $5/mo instance includes 1TB. Overages are $0.01/GB. Cost = **$290 / month**.
- **Hetzner**: $5/mo instance includes 20TB. Overages are ~$0.001/GB. Cost = **$15 / month**.
- **BuyVM / Dedicated Unmetered**: Fixed ~$20 - $50 / month for 1Gbps unmetered lines.

*Conclusion*: Scale using Hetzner or specialized unmetered offshore VPS providers to keep profit margins near 95%.

---

## 6. Multi-Node (Master/Slave) Evolution

To expand globally, SpicyVPN must transition from a Single-Node setup to a Master/Slave architecture.

### The Master (Central Hub)
- Hosted centrally (e.g., Vercel or a stable VPS).
- Runs Next.js, Stripe billing, and a scalable database (migrate from SQLite to PostgreSQL).
- Generates links with dynamic subdomains: `us-east.spicypepper.app`, `sg.spicypepper.app`.

### The Slaves (Global Edge Nodes)
- Hosted on cheap, regional VPS servers.
- Runs *only* Hysteria 2 and the Traffic Agent.
- **The Handshake**:
  1. **Auth**: The Slave's Hysteria config points its HTTP Auth Hook over the public internet back to the Master API (`https://spicypepper.app/api/node-auth`). 
  2. **Sync**: The Slave's Traffic Agent queries its local Hysteria core, compiles the bandwidth delta, and sends an authenticated `POST` request to the Master.
  3. **Enforcement**: The Master updates PostgreSQL, checks quotas, and responds to the Slave's POST request with a JSON array of UUIDs: `{"kick": ["uuid-1", "uuid-2"]}`. The Slave executes the kicks locally.

---

## 7. Product Roadmap & Monetization Strategy

We have established the technical foundation. The next phases focus on commercialization and frictionless UX.

### Phase 1: UX & Frictionless Onboarding
- **Deep Linking**: Implement `hiddify://import/` protocol links. Users on mobile can tap one button on the dashboard to instantly populate their VPN client without manual copying.
- **QR Codes**: Dynamically generate QR codes of the subscription link on the desktop dashboard for instant mobile scanning.
- **Live User Feedback**: Reflect the `lastActive` status on the user's dashboard with a "🟢 Connected" indicator.

### Phase 2: The Native Desktop Client (`stealthvpn-desktop`)
- Build out the Tauri/Electron application. 
- Rather than teaching users how to install Hiddify and configure "VPN Mode", the native app will:
  1. Authenticate via NextAuth internally.
  2. Bundle a hidden instance of the Hysteria core binary.
  3. Provide a massive, idiot-proof "Connect" button that modifies system routing tables automatically to capture UDP game traffic.

### Phase 3: SaaS Monetization (Stripe Integration)
- Implement a rigid trial system (e.g., 2GB or 2 days free).
- Integrate Stripe Webhooks.
- **Tiers**:
  - *Basic* ($3.99/mo) - 50GB Limit.
  - *Pro* ($6.99/mo) - 200GB Limit + Ad-blocking DNS integration.
  - *Gamer* ($9.99/mo) - Unlimited Data + Access to premium, low-latency regional nodes (e.g., specific IPs whitelisted for optimal Riot/Valve server routing).
- **Enforcement update**: Modify `/api/vpn` to prevent regenerating free UUIDs if the user has not paid for the current billing cycle.
