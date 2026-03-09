# 🌶️ SpicyVPN (StealthVPN) - The Ultimate Stealth VPN Platform

Welcome to the comprehensive documentation for **SpicyVPN**. This document covers every aspect of the product, from the underlying protocols and system architecture to deployment, cost analysis, and future roadmaps.

## 📖 Table of Contents
1. [Product Overview](#1-product-overview)
2. [Technology Stack & Protocol](#2-technology-stack--protocol)
3. [Architecture & How It Works](#3-architecture--how-it-works)
4. [Infrastructure & Setup](#4-infrastructure--setup)
5. [Cost Analysis (Current & Future)](#5-cost-analysis)
6. [Node Management & Scaling](#6-node-management--scaling)
7. [Future Roadmap & Monetization](#7-future-roadmap--monetization)

---

## 1. Product Overview
SpicyVPN is a high-performance, next-generation VPN management platform. Designed to bypass aggressive network restrictions (like Deep Packet Inspection) and provide ultra-low latency for gaming and streaming. It features an automated user portal, auto-updating client configurations, and rigorous data/time quota enforcement.

---

## 2. Technology Stack & Protocol

### The Core Protocol: Hysteria 2
Instead of traditional VPN protocols like OpenVPN or WireGuard (which are easily blocked by modern firewalls), SpicyVPN is powered by **Hysteria 2**.
- **Transport**: UDP-based QUIC protocol.
- **Stealth / Obfuscation**: It masquerades as standard HTTP/3 traffic (e.g., disguising itself as connections to `bing.com`). Firewalls and ISPs see it as normal web browsing, preventing throttling and blocking.
- **Performance**: Brutal UDP acceleration ensures ultra-low latency (ping) and maximum throughput, making it highly effective for competitive gaming (Valorant, CS:GO) and bypassing congested international routing.

### The Web & Management Stack
- **Frontend/Backend**: **Next.js 16 (React)**. Handles the user UI, Google OAuth, subscription API, and the secure Admin Dashboard.
- **Database**: **SQLite (via better-sqlite3)**. Chosen for its blazing-fast local performance. Configured in **WAL (Write-Ahead Logging)** mode to allow simultaneous reads (from the Web API) and writes (from the background traffic agent) without database locking.
- **Traffic Agent**: A lightweight **Node.js daemon** that constantly polls the VPN core and syncs with the database.

---

## 3. Architecture & How It Works

SpicyVPN operates on a synchronized trinity of services:

1. **The Web API (`stealthvpn.service`)**
   - Users log in via Google OAuth.
   - Generates a unique UUID and a secure token for each user, automatically assigning a 30-day, 30GB limit.
   - Provides a `/api/sub` endpoint. When clients (like Hiddify) fetch this link, it returns the Base64 encoded Hysteria config along with `Profile-Update-Interval` and `Subscription-Userinfo` headers so the app knows the exact data limits and auto-refreshes every hour.

2. **The VPN Core (`hysteria-server.service`)**
   - Listens on `UDP 8443` for client connections.
   - **Auth Hook**: When a client attempts to connect, Hysteria asks the Next.js API (`POST /api/h2/auth`). The API checks the SQLite DB to ensure the user exists, hasn't expired, and has data left. If valid, it returns the user's ID to track traffic.

3. **The Enforcer (`stealthvpn-agent.service`)**
   - Every 30 seconds, this background script queries Hysteria's internal REST API (`TCP 8080`) for live `tx` and `rx` (transmit/receive) bytes.
   - It calculates the data used since the last ping and updates the SQLite database.
   - **Active Kicking**: If a user hits their 30GB limit or their time expires *while* actively connected, the agent immediately sends a `POST /kick` command to Hysteria, instantly severing their VPN connection mid-session.

---

## 4. Infrastructure & Setup

### Where We Set It Up
Currently, the entire stack (Database, Web UI, and VPN Core) is hosted on a **Single Node architecture**.
- **Provider**: Oracle Cloud (Free Tier).
- **OS**: Ubuntu Linux (ARM64 compatible).
- **Network**: Domain `spicypepper.app` routed to the VPS, utilizing reverse proxy/SSL termination.

### How It Was Set Up
1. Installed Node.js (v20) and npm.
2. Downloaded the compiled Hysteria 2 binary to `/usr/local/bin/hysteria`.
3. Cloned the Next.js repository.
4. Initialized the SQLite database schemas (`users`, `vpn_configs`, `token_devices`) using `scripts/init-db.js`.
5. Created `.env` with Google OAuth secrets and admin credentials.
6. Bound `systemd` services to ensure the Web App, Hysteria Core, and Traffic Agent restart automatically on crashes or reboots.

---

## 5. Cost Analysis

### Current Costs: $0 / month
Because we are utilizing the **Oracle Cloud Free Tier**, the current operational cost is strictly zero. Oracle provides generous compute instances with up to 10TB of outbound bandwidth per month for free, which is more than enough to test, launch, and host early users.

### Future Costs & Scaling Estimates
When the user base expands beyond the free tier, costs will primarily revolve around **Outbound Bandwidth (Egress)**.
- **Compute**: Next.js and SQLite are extremely efficient. A standard $5 - $10/month VPS (from DigitalOcean, Linode, or Hetzner) can easily handle thousands of database queries and API hits.
- **Bandwidth Costs (Standard Providers)**:
  - Usually costs around **$0.01 per GB** (or $10 per TB) after the included quota (which is typically 1TB - 20TB depending on the host).
  - If 100 users consume their full 30GB quota, that is 3TB of traffic.
  - On a provider like Hetzner (20TB included), this is effectively $5/month total. On AWS/GCP, bandwidth is excessively expensive ($0.09/GB), so those platforms should be avoided for hosting VPN nodes.

---

## 6. Node Management & Scaling

### Current: Single-Node Architecture
Right now, the web server, database, and VPN router exist on the exact same VPS. This is perfect for an MVP and initial growth. It is simple, extremely fast, and has zero network latency between the database and the VPN core.

### Future: Multi-Node Architecture (The Master/Slave Model)
As the user base grows, we will need VPN servers in different regions (US, Europe, Asia) to provide better routing for users worldwide.
- **The Master (Website & DB)**: The Next.js app and database will sit on one central server (or Vercel). It handles all billing, user accounts, and link generation.
- **The Slaves (VPN Nodes)**: Cheap $5 servers spread worldwide running *only* Hysteria 2 and the Traffic Agent.
- **Synchronization**: The Slave nodes will authenticate users by sending HTTP hooks over the internet back to the Master API. The Slave's Traffic Agent will securely `POST` traffic usage back to the Master. The Master calculates the totals and instructs the Slaves to `/kick` users when they run out of data.

---

## 7. Future Roadmap & Monetization

We have built a completely functional, automated VPN pipeline. The next phase is turning this into a highly scalable subscription-based SaaS.

### Phase 1: Polishing the Product
- **Native Desktop/Mobile Clients**: Transitioning users away from third-party apps (like Hiddify) by finishing the custom `stealthvpn-desktop` Electron/Tauri app. A seamless, one-click "Connect" button built explicitly for SpicyVPN.
- **Better Onboarding**: Deep linking (`hiddify://`) and dashboard QR codes for zero-friction mobile installation.

### Phase 2: Monetization Integration
- **Stripe Integration**: Implement a payment wall. When a user creates an account, they get a 1-day/2GB free trial. Afterwards, they must subscribe to generate new configs.
- **Subscription Tiers**:
  - *Basic*: 50GB/month for $3.99.
  - *Pro*: 200GB/month for $6.99.
  - *Gamer*: Unlimited data, priority routing (access to premium, low-latency node regions).
- **Crypto Payments**: Integrate a crypto gateway (like BTCPay or Coinbase Commerce) to allow privacy-conscious users to purchase bandwidth anonymously.

### Phase 3: Advanced Features
- **Node Selection**: Allow users to pick which country they want to connect to directly from their dashboard.
- **Referral System**: Grant users +10GB of data for every friend they invite who signs up.

---

*SpicyVPN is built for speed, stealth, and seamless user experience. By utilizing Hysteria 2 and a heavily optimized automated Next.js stack, we have created an enterprise-grade infrastructure with minimal overhead.*
