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

---

## 1. Tech Stack

SpicyVPN is built on a modern, full-stack JavaScript ecosystem paired with a high-speed networking core:

- **Frontend Interface:** Next.js 16 (App Router, Turbopack), React 18, Tailwind CSS, Framer Motion.
- **Backend APIs:** Next.js Serverless API Routes (Node.js).
- **Database:** SQLite (via `better-sqlite3` with WAL mode) for zero-latency, high-concurrency lookups.
- **Authentication:** NextAuth.js (Google OAuth).
- **VPN Core Engine:** **Xray-core** v26+ (VLESS protocol over gRPC transport).
- **Telemetry & Sync:** Node.js Daemon utilizing the Xray gRPC API (`10085`).
- **Infrastructure Management:** `systemd` for process daemonization.

---

## 2. Architecture & Process Flow

SpicyVPN strictly separates the "Control Plane" (Next.js & SQLite) from the "Data Plane" (Xray).

1. **Identity Generation:** A user logs into the Next.js site and generates a VPN config. The application generates a secure `token` (for internal tracking) and a `uuid` (for VLESS authentication). This is stored in SQLite with a dynamic data limit (default: 50GB) and a 30-day expiry.
2. **Subscription Delivery:** The user imports a subscription link into their client (Hiddify, Nekobox, or SpicyVPN Desktop). The `/api/sub` endpoint dynamically generates a `vless://` URI configured for the gRPC transport on Port **8444**.
3. **Continuous State Sync:** A background Node.js service (`xray-traffic-tracker.mjs`) polls the SQLite database every 10 seconds. It compares the database's active users against Xray's memory.
   - It issues `xray api adu` (Add User) commands for any new active users.
   - It issues `xray api rmu` (Remove User) commands for any users who were manually deactivated by an admin.
4. **Telemetry & Enforcement:** The same tracker queries Xray's internal statistics API (`xray api statsquery`). It aggregates `uplink` and `downlink` bytes, updating the `totalUp` and `totalDown` columns in SQLite.
   - **The Kicker:** If a user's total usage exceeds their dynamic `dataLimit`, or their 30-day window expires, the tracker instantly drops their active connection in Xray and flags `active=0` in the database to prevent re-authentication.

---

## 3. Frontend Details (Control Plane)

The frontend serves as the centralized management console, utilizing a unified "Premium Glass" aesthetic.

### **User Dashboard (`/dashboard`)**
- **Dynamic Config Management:** Reads the user's specific `dataLimit` and `expiresAt` timestamps from the database. Calculates remaining days and gigabytes dynamically.
- **Renewal Logic:** If a user exhausts their data limit or their time expires, the UI shifts states to allow them to "Renew Access Link," which interacts with `/api/vpn` to issue a fresh UUID and reset their limits.
- **Client Guides:** Provides direct download links to the custom **SpicyVPN Desktop App** (v1.0.67+) and guides for Hiddify/Nekobox.

### **Admin Console (`/admin`)**
- **Tabbed Interface:** Features a dual-pane dashboard with **Users** and **Nodes** management tabs for streamlined fleet oversight.
- **Node Lifecycle Management:** Allows instant provisioning of new remote nodes. Admins provide a name and IP, and the system generates a secure `apiKey` and a custom multi-architecture `curl` installer command.
- **Live Fleet Monitoring:** Accurately calculates "Live Now" users per node. It determines this by scanning the central database for any user whose `lastActive` timestamp was updated by either the local or remote tracker within the last 60 seconds.
- **Hardware Telemetry:** Displays real-time VPS CPU load, Memory usage, Storage, and Global Throughput. 

---

## 4. Backend Details (Data Plane & APIs)

The backend logic is self-contained within the Next.js `/api` directory and standalone Node scripts.

### **The Cloudflare Worker Bridge**
To bypass domain-level blocking (common in restricted environments like colleges), we utilize a high-availability bridge:
- **Endpoint:** `https://proud-union-953f.octd258.workers.dev/`
- **Role:** Acts as a transparent proxy for the `/api/sub` endpoint. 
- **Mechanism:** When the primary `spicypepper.app` domain is unreachable, the desktop client automatically fails over to this worker. The worker fetches the subscription data from the server's API and returns it with preserved headers, ensuring zero downtime for users on blocked networks.

### **Next.js Node APIs**
- **`/api/admin/nodes`:** Handles Node CRUD operations. It also performs **Zero-Loss Accounting** by aggregating traffic from both active and deleted nodes to ensure the global dashboard always matches the regional sum.
- **`/api/node/sync`:** The high-speed endpoint for remote agents to fetch their assigned user identities and cryptographic tokens.
- **`/api/node/report`:** The primary heartbeat receiver. It processes raw telemetry data and performs server-side differential math to update user bandwidth totals securely.

### **The Telemetry Daemon (`xray-traffic-tracker.mjs`)**
This is the core engine connecting the web database to the VPN server. It runs continuously via `systemd` (`xray-tracker.service`).
- **Master Node Duty:** Scopes its database queries to only handle users explicitly assigned to `node-1`.
- **Conflict Resolution:** Maintains a `Set` of known tokens to minimize unnecessary API calls to Xray. It handles concurrent additions/removals safely and logs all Kicker and Cleanup events.

---

## 5. Horizontal Scaling Architecture

SpicyVPN is designed for global scalability using a **Master-Slave (Orchestrator-Agent)** model. This allows a single control plane to manage a distributed fleet of high-performance nodes across multiple regions and cloud providers.

### **The Master Node (Orchestrator)**
The primary server (`spicypepper.app`) acts as the Source of Truth and the central brain.
- **Stateless Scaling:** Remote nodes hold zero local data. User records, traffic totals, and expiration dates live exclusively in the Master SQLite database.
- **Load Balancing (Least Connections):** When a user generates or renews a config, the Master automatically assigns them to the node with the **lowest number of live users** to ensure even load distribution.
- **Regional Bandwidth Isolation:** Traffic generated on Node-B is reported to the Master and billed correctly to the user's global quota, but the data is physically processed only by the regional VPS.

### **The Remote Nodes (Slaves)**
Remote nodes are lightweight VPS instances running **Xray-core** and a custom **SpicyAgent** daemon.
- **Auto-Provisioning:** A multi-architecture `install.sh` script automatically detects `x86_64` vs `ARM64`.
- **Firewall Automation:** The installer automatically configures `iptables` for Oracle Cloud (OCI) environments, opening Port 8444 (VPN) and enabling ICMP for latency checks.
- **User Synchronization:** Every 10 seconds, the agent pulls the latest list of authorized users. It performs a file-based diff using standard Linux tools (`comm`, `sort`) and issues `xray api adu/rmu` commands to dynamically update the tunnel.

### **Precision Telemetry Logic**
- **Stability-First CPU Monitoring:** Instead of jittery 1-second snapshots, the agent calculates CPU usage using the **1-minute Load Average** divided by the total logical core count. This ensures consistent 0-100% reporting across different CPU architectures.
- **Safe Delta Bandwidth Tracking:** To prevent "billing leaks" during Xray restarts (which reset counters to zero), the system uses a **Differential Math** model.
  1. The Agent pushes raw totals to the Master.
  2. The Master compares this against the `lastTraffic` snapshot stored in the DB.
  3. If the total dropped (restart detected), the Master resets the snapshot and only bills the new incremental data.
- **Zero-Loss Accounting (The General Ledger):** To solve the "Ghost Traffic" problem when nodes are deleted, the Master Node record acts as a catch-all for any traffic that isn't explicitly claimed by an active remote node. This guarantees that your main dashboard total is always 100% accurate.

---

## 6. Directory Structure

A high-level map of the codebase and system dependencies:

```text
/home/ubuntu/.openclaw/workspace/stealthvpn/
├── app/                        # Next.js App Router root
│   ├── admin/                  # Admin Console UI
│   ├── api/                    # Backend Control Plane
│   │   ├── admin/              # Admin CRUD and VPS Stats logic
│   │   ├── auth/               # NextAuth endpoints
│   │   ├── sub/                # Client Subscription API
│   │   └── vpn/                # User Config Generation/Renewal
│   ├── dashboard/              # User Dashboard UI
│   └── globals.css             # Tailwind & Global Styles
├── components/                 # React UI Components
│   ├── AdminDashboard.tsx      # Core Admin Interface
│   ├── Dashboard.tsx           # Core User Interface
│   └── GlassCard.tsx           # Premium UI Wrapper
├── lib/                        # Shared Utilities
│   ├── auth.ts                 # NextAuth Configuration
│   └── db.ts                   # SQLite Schema & Migrations
├── prisma/                     # Database Directory
│   └── dev.db                  # SQLite Database File
├── xray-traffic-tracker.mjs    # Background Sync, Telemetry & Kicker Service
└── xray-bulk-load.mjs          # Utility: One-time DB-to-Xray Migration Script

/usr/local/etc/xray/            # OS-Level Xray Config
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

**🌶️ Stay Spicy. Stay Fast.**
