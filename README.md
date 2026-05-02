# 🌶️ SpicyVPN (StealthVPN) - Enterprise VLESS gRPC Architecture

Welcome to the comprehensive documentation for **SpicyVPN**. This project is a fully integrated, high-performance VPN solution utilizing the **VLESS + gRPC** protocol via **Xray-core**, designed to bypass restrictive DPI (Deep Packet Inspection) networks and provide seamless connectivity with maximum stealth.

---

## 📖 Master Table of Contents
1. [Tech Stack](#1-tech-stack)
2. [Architecture & Process Flow](#2-architecture--process-flow)
3. [Frontend Details (Control Plane)](#3-frontend-details-control-plane)
4. [Backend Details (Data Plane & APIs)](#4-backend-details-data-plane--apis)
5. [Directory Structure](#5-directory-structure)
6. [Operational Commands](#6-operational-commands)

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
- **Client Guides:** Provides direct download links to the custom **SpicyVPN Desktop App** (v1.0.64+) and guides for Hiddify/Nekobox.

### **Admin Console (`/admin`)**
- **Live Fleet Monitoring:** Accurately calculates "Live Now" users. It determines this by scanning the database for any user whose `lastActive` timestamp was updated by the traffic tracker within the last 60 seconds.
- **Hardware Telemetry:** Displays real-time VPS CPU load, Memory usage, Storage, and Global Throughput by executing low-level shell commands (`os.cpus()`, `df`, etc.) via the `/api/admin/stats` route.
- **Identity Registry:** Allows administrators to filter the fleet (Live Users, Active Subs, Newest) and forcefully revoke access keys. Revocations are detected by the sync daemon and instantly pushed to Xray.

---

## 4. Backend Details (Data Plane & APIs)

The backend logic is self-contained within the Next.js `/api` directory and standalone Node scripts.

### **Next.js API Routes**
- **`/api/vpn`:** Handles the creation and renewal of identities. It enforces a strict 1-active-config-per-user rule. When generating, it sets `expiresAt` (now + 30 days) and `dataLimit` (50GB).
- **`/api/admin/stats`:** Gathers OS-level metrics and aggregates SQLite data to feed the Admin Dashboard.
- **`/api/sub`:** Acts as the endpoint for client auto-updates. 
  - Validates the user token.
  - Updates the `token_devices` table to track client IP addresses.
  - Dynamically constructs the Base64-encoded `vless://` payload.
  - Returns `Subscription-Userinfo` headers so mobile clients can natively display upload/download stats and data limits locally.

### **The Telemetry Daemon (`xray-traffic-tracker.mjs`)**
This is the core engine connecting the web database to the VPN server. It runs continuously via `systemd` (`xray-tracker.service`).
- **Target:** Connects to Xray's API port on `127.0.0.1:10085`.
- **Target Tag:** Pushes configurations explicitly to the `vless-grpc` inbound tag on Port 8444.
- **Conflict Resolution:** Maintains a `Set` of known tokens to minimize unnecessary API calls to Xray. It handles concurrent additions/removals safely and logs all Kicker and Cleanup events.

---

## 5. Directory Structure

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

## 6. Operational Commands

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