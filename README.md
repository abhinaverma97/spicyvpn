# SpicyVPN 

Welcome to the comprehensive documentation for **SpicyVPN**. This project is a fully integrated, high-performance VPN solution utilizing the **VLESS + gRPC** protocol via **Xray-core**, designed to bypass restrictive DPI (Deep Packet Inspection) networks and provide seamless connectivity with maximum stealth.

---

## Table of Contents
1. [Tech Stack](#1-tech-stack)
2. [Architecture & Process Flow](#2-architecture--process-flow)
3. [Frontend Details (Control Plane)](#3-frontend-details-control-plane)
4. [Backend Details (Data Plane & APIs)](#4-backend-details-data-plane--apis)
5. [Horizontal Scaling Architecture](#5-horizontal-scaling-architecture)
6. [Directory Structure](#6-directory-structure)
7. [Operational Commands](#7-operational-commands)
8. [Test Node (Isolated)](#8-test-node-isolated)

---

## 1. Tech Stack

SpicyVPN is built on a modern, full-stack JavaScript ecosystem paired with a high-speed networking core:

- **Frontend Interface:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Framer Motion, OGL (WebGL).
- **Backend APIs:** Next.js Serverless API Routes (Node.js).
- **Database:** SQLite (via `better-sqlite3` with WAL mode) for zero-latency, high-concurrency lookups.
- **Authentication:** NextAuth.js v5 (Google OAuth with custom SQLite Adapter).
- **VPN Core Engine:** **Xray-core** v26+ (VLESS protocol over gRPC transport).
- **Telemetry & Sync:** Node.js Daemons utilizing the Xray gRPC API (`10085`).
- **Infrastructure Management:** `systemd` for process daemonization.

---

## 2. Architecture & Process Flow

SpicyVPN strictly separates the "Control Plane" (Next.js & SQLite) from the "Data Plane" (Xray).

1. **Identity Generation:** A user logs into the Next.js site and generates a VPN config. The application generates a secure `token` (for internal tracking) and a `uuid` (for VLESS authentication). This is stored in SQLite with a dynamic data limit (default: 50GB) and a 30-day expiry.
2. **Subscription Delivery:** The user imports a subscription link into their client (Hiddify, Nekobox, or SpicyVPN Desktop). The `/api/sub` endpoint dynamically evaluates fleet load using `getBestNode()` (least connected active node) and generates a `vless://` URI configured for gRPC transport on Port **8444**.
3. **Continuous State Sync:** A background Node.js service (`xray-traffic-tracker.mjs`) runs on the master node every 30 seconds (`setInterval(syncAndTrack, 30000)`). It compares the active users assigned to `node-1` in SQLite against Xray's memory:
   - Issues `xray api adu` (Add User) commands for any new active users.
   - Issues `xray api rmu` (Remove User) commands for any users who were manually deactivated or exceeded quotas.
4. **Telemetry & Enforcement:** The tracker queries Xray's internal statistics API (`xray api statsquery`). It aggregates `uplink` and `downlink` bytes, updating the `totalUp` and `totalDown` columns in SQLite every 60 seconds (2 cycles).
   - **The Kicker:** If a user's total usage exceeds their dynamic `dataLimit`, or their 30-day window expires, the tracker instantly drops their active connection in Xray and sets `active=0` in the database to prevent re-authentication.

---

## 3. Frontend Details (Control Plane)

The frontend serves as the centralized management console, utilizing a unified "Premium Glass" visual aesthetic with interactive components (Dither canvas backgrounds, spotlight cards, and text scramblers).

### **User Dashboard (`/dashboard`)**
- **Dynamic Config Management:** Reads the user's specific `dataLimit` and `expiresAt` timestamps from the database. Calculates remaining days and gigabytes dynamically.
- **Renewal Logic:** If a user exhausts their data limit or their time expires (less than 24 hours remaining), the UI enables "Renew Access Link," which interacts with `/api/vpn` to revoke the old config, issue a fresh UUID/token, and reset limits.
- **Client Guides & Failover:** Provides direct copy links for subscription URIs (routed through Cloudflare Worker proxy for DPI resistance) and client installation instructions.

### **Admin Console (`/admin`)**
- **Tabbed Interface:** Features a dual-pane dashboard with **Users** and **Nodes** management tabs for streamlined fleet oversight.
- **Node Lifecycle Management:** Allows instant provisioning of remote nodes. Admins specify a node name and IP, generating a secure `apiKey` and custom multi-architecture `curl` installer command.
- **Live Fleet Monitoring:** Calculates "Live Now" users per node by scanning the database for users with active timestamps updated within the last 60 seconds.
- **Hardware Telemetry:** Displays real-time VPS CPU load, Memory usage, Storage usage, and Global Monthly Throughput.

---

## 4. Backend Details (Data Plane & APIs)

The backend logic is self-contained within Next.js `/api` endpoints and standalone Node daemons.

### **The Cloudflare Worker Bridge**
To bypass domain-level blocking (common in restricted environments like universities), a high-availability bridge proxy is deployed:
- **Endpoint:** `https://proud-union-953f.octd258.workers.dev/`
- **Role:** Acts as a transparent proxy for the `/api/sub` endpoint.
- **Mechanism:** When the primary domain is unreachable, clients route subscription fetches through this worker, which proxies requests to the Master API while preserving required headers (`Subscription-Userinfo`).

### **Next.js API Routes**
- **`/api/vpn`:** Handles user configuration retrieval (GET) and new config generation / renewal (POST).
- **`/api/sub`:** Serves Base64-encoded `vless://` subscription links with live load-balancing node resolution.
- **`/api/admin`:** Admin user fleet query, search, filtering, and user deletion.
- **`/api/admin/nodes`:** Handles Node CRUD operations, status toggling, and **Zero-Loss Accounting** by aggregating traffic from active and deleted nodes.
- **`/api/admin/stats`:** Returns system resource telemetry (CPU, RAM, disk, load average) and active connection metrics.
- **`/api/node/sync`:** High-speed endpoint for remote agent daemons to fetch authorized user lists and synchronized Master SSL certificates.
- **`/api/node/report`:** Heartbeat and telemetry ingestion endpoint for remote agents. Processes raw traffic matrices with differential math.

### **The Telemetry Daemon (`xray-traffic-tracker.mjs`)**
The master node sync engine running continuously via `systemd` (`xray-tracker.service`).
- **Master Node Duty:** Scopes database queries to users assigned to `node-1` or unassigned (`nodeId IS NULL`).
- **Conflict Resolution:** Maintains in-memory token sets to optimize Xray gRPC API calls and safely process additions, removals, and auto-kicks.

---

## 5. Horizontal Scaling Architecture

SpicyVPN scales globally using a **Master-Slave (Orchestrator-Agent)** model, enabling a single control plane to manage a distributed fleet of regional nodes across cloud providers.

### **The Master Node (Orchestrator)**
The primary server acts as the central brain and Source of Truth.
- **Stateless Scaling:** Remote nodes hold zero persistent state. User accounts, bandwidth metrics, and expiry limits exist exclusively in the Master SQLite database.
- **Load Balancing (Least Connections):** When a user requests a config or subscription, the Master assigns them to the node with the **lowest live user count** (`getBestNode()`).
- **SSL Certificate Synchronization:** Master SSL certificates (`spicypepper.app.crt`/`.key`) are distributed to remote nodes via `/api/node/sync`. When cert updates are detected, remote nodes write them to `/usr/local/etc/xray/certs/` and restart Xray.

### **The Remote Nodes (Slaves)**
Remote nodes are lightweight VPS instances running **Xray-core** and the **SpicyAgent** daemon (`agent.mjs`).
- **Auto-Provisioning:** Multi-architecture `public/api/node/install.sh` detects `x86_64` vs `ARM64`, installs Xray-core, configures `systemd` services, and applies firewall rules (`iptables` for OCI).
- **User Synchronization:** Every 10 seconds (`setInterval(sync, 10000)`), the agent fetches authorized users from `/api/node/sync`, applies incremental `adu`/`rmu` diffs to Xray memory, and syncs local state.

### **Precision Telemetry Logic**
- **Stability-First CPU Monitoring:** Calculates CPU usage using `/proc/stat` delta differences to provide consistent 0-100% telemetry across CPU architectures.
- **Safe Delta Bandwidth Tracking:** Prevents billing leaks during Xray service restarts using differential math:
  1. Remote agent pushes raw Xray stat totals to `/api/node/report`.
  2. Master computes differences against `lastTraffic` stored in the database.
  3. If counter drops (Xray restarted), the Master resets the snapshot and bills only incremental data.
- **Zero-Loss Accounting:** Master node record (`node-1`) acts as a general ledger catch-all for legacy or deleted node traffic, ensuring global monthly totals remain accurate.

---

## 6. Directory Structure

A high-level map of the codebase and system dependencies:

```text
spicyvpn/
├── app/                        # Next.js App Router root
│   ├── admin/                  # Admin Console UI
│   ├── api/                    # Backend Control Plane
│   │   ├── admin/              # Admin CRUD, nodes & stats APIs
│   │   │   ├── nodes/          # Node lifecycle & traffic allocation
│   │   │   └── stats/          # System telemetry & connection metrics
│   │   ├── auth/               # NextAuth endpoints
│   │   ├── node/               # Remote Node sync & report APIs
│   │   │   ├── sync/           # Remote node user & SSL cert provider
│   │   │   └── report/         # Node heartbeat & traffic report receiver
│   │   ├── sub/                # Client Subscription API
│   │   └── vpn/                # User Config Generation & Renewal API
│   ├── dashboard/              # User Dashboard UI
│   ├── privacy/                # Privacy Policy Page
│   ├── terms/                  # Terms of Service Page
│   ├── globals.css             # Tailwind CSS v4 & Global Styles
│   └── layout.tsx              # Root Layout & Provider Wrappers
├── components/                 # React UI Components
│   ├── ui/                     # Shadcn UI primitives (avatar, badge, button, card, etc.)
│   ├── AdminDashboard.tsx      # Fleet Management & Monitoring Interface
│   ├── Dashboard.tsx           # User Control Panel Interface
│   ├── Dither.tsx              # Dynamic Canvas Dither Background Component
│   ├── Footer.tsx              # Application Footer
│   ├── GlassCard.tsx           # Premium Glassmorphism Container
│   ├── LandingPage.tsx         # Modern Landing Page Component
│   ├── MorphText.tsx           # Morphing Text Animation Component
│   ├── ScrambleText.tsx        # Text Scrambler Effect Component
│   └── SpotlightCard.tsx       # Interactive Spotlight Card Effect
├── lib/                        # Core Shared Utilities
│   ├── adapter.ts              # Custom SQLite NextAuth Storage Adapter
│   ├── auth.ts                 # NextAuth Configuration (Google OAuth)
│   ├── db.ts                   # SQLite Schema & Dynamic Load Balancer
│   └── utils.ts                # Class merge helpers (cn)
├── prisma/                     # Database Storage Location
│   └── dev.db                  # Main SQLite Database File
├── public/                     # Static Assets & Remote Node Installer
│   └── api/node/               # Distributed Node Agent Assets
│       ├── agent.mjs           # Node Slave Synchronization Daemon
│       └── install.sh          # Multi-Arch Automated Node Provisioning Script
├── scripts/                    # Management & Benchmark Scripts
│   └── install-optimized-test-node.sh  # Low-Latency Gaming Optimized Test Node Installer
├── deploy.sh                   # Deployment Automation Script
├── DOMAIN_MIGRATION.md         # Domain Migration Checklist & Guide
├── xray-traffic-tracker.mjs    # Master Telemetry, Sync & User Kicker Service
└── xray-bulk-load.mjs          # One-Time DB-to-Xray Bulk Loading Utility

/usr/local/etc/xray/            # OS-Level Xray Config (Master & Remote Nodes)
└── config.json                 # Core Xray Configuration (Ports 8444, 10085)
```

---

## 7. Operational Commands

### Process Management
- **VPN Core Engine:** `sudo systemctl restart xray`
- **Telemetry Sync Daemon:** `sudo systemctl restart xray-tracker`
- **Web Application:** `sudo systemctl restart stealthvpn`

### Troubleshooting & Logs
- **VPN Connections & Errors:** `sudo journalctl -u xray -f`
- **Web App Errors:** `sudo journalctl -u stealthvpn -f`
- **Sync/Kicker Activity:** `sudo journalctl -u xray-tracker -f`

---

## 8. Test Node (Isolated)

A standalone installer that sets up an **isolated Xray node** on any VPS without connecting to the SpicyVPN fleet. Includes anti-bufferbloat kernel TCP tuning (`cubic`, `fq_codel`, `tcp_notsent_lowat = 16384`):

```bash
curl -sL https://raw.githubusercontent.com/abhinaverma97/spicyvpn/main/scripts/install-optimized-test-node.sh | bash -s -- --ip <vps-public-ip>
```

The script outputs a VLESS link you can import directly into Hiddify.

### Complete cleanup
```bash
sudo systemctl stop xray-opt-test 2>/dev/null; sudo systemctl disable xray-opt-test 2>/dev/null; sudo rm -rf /usr/local/etc/xray /usr/local/bin/xray /etc/systemd/system/xray-opt-test.service /etc/sysctl.d/99-spicyvpn-opt.conf && sudo systemctl daemon-reload
```

---

**🌶️ Stay Spicy. Stay Fast.**
