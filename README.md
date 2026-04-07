# 🌶️ SpicyVPN (StealthVPN) - Enterprise Hysteria 2 Architecture

Welcome to the comprehensive documentation for **SpicyVPN**. This project is a fully integrated, high-performance VPN solution utilizing the **Hysteria 2** protocol, designed to bypass restrictive networks and provide seamless connectivity.

---

## 📖 Master Table of Contents
1. [Tech Stack](#1-tech-stack)
2. [Architecture & Process Flow](#2-architecture--process-flow)
3. [How the Frontend Works](#3-how-the-frontend-works)
4. [How the Backend Works](#4-how-the-backend-works)
5. [Directory Structure](#5-directory-structure)
6. [Operational Commands](#6-operational-commands)

---

## 1. Tech Stack

SpicyVPN is built on a modern, full-stack JavaScript ecosystem paired with a high-speed networking core:

- **Frontend Interface:** Next.js 16 (App Router), React 18, Tailwind CSS, Framer Motion.
- **Backend Control Plane:** Next.js API Routes (Node.js).
- **Database:** SQLite (via `better-sqlite3`) for zero-latency lookups.
- **Authentication:** NextAuth.js (Google OAuth).
- **VPN Core Engine:** Standalone **Hysteria 2** binary (UDP/QUIC protocol).
- **Infrastructure Management:** `systemd` for process management (Next.js, Hysteria 2, Traffic Tracker).

---

## 2. Architecture & Process Flow

SpicyVPN separates the "Control Plane" (Next.js/SQLite) from the "Data Plane" (Hysteria 2).

1. **User Generation:** A user logs into the Next.js site and generates a VPN config. The site creates a secret token and stores it in the SQLite database with a 35GB/30-day quota.
2. **Client Connection:** The user pastes their `hy2://` URI into their client (SpicyVPN Desktop or Hiddify). The client initiates a UDP QUIC handshake with the server on **Port 8388**.
3. **HTTP Authentication Webhook:** The Hysteria 2 engine intercepts the connection and fires a silent HTTP POST request to the Next.js API (`/api/h2/auth`), sending the user's token.
4. **Validation:** Next.js checks the SQLite database. If the token is valid, active, and within its data/time quotas, it responds with a `200 OK`. The VPN tunnel is established.
5. **Continuous Telemetry:** A background Node.js service (`traffic-tracker.mjs`) polls Hysteria 2 every 10 seconds to collect real-time data usage and writes it back to the database, maintaining perfect synchronization.

---

## 3. How the Frontend Works

The frontend serves as the centralized management console for both end-users and administrators. It utilizes a unified "Premium Glass" aesthetic.

### **User Dashboard (`/dashboard`):**
- **Single Connection URI:** Users are provided with a universal `hy2://` URI. This URI contains all routing and security information.
- **Compatibility:** The UI provides specific connection guides for the **SpicyVPN Desktop App** (Windows/Linux) and **Hiddify** (Mobile/macOS).
- **Real-Time Expiry:** Visually warns the user when their data limit is hit or their plan expires, prompting them to generate a new key.

### **Admin Console (`/admin`):**
- **Hardware Telemetry:** Displays real-time CPU, RAM, Storage, and Global Throughput directly from the VPS.
- **Live Monitoring:** Accurately calculates "Live Now" users by checking if an identity has transmitted data in the last 60 seconds.
- **Identity Registry:** Administrators can filter the fleet by Live Users, Active Subs, or Newest, and can instantly revoke access keys.

---

## 4. How the Backend Works

The backend logic is entirely self-contained within the Next.js `/api` directory and local Node scripts.

- **`/api/vpn`:** Handles the creation of new identities. It enforces the strict 1-active-config-per-user rule and assigns the 35GB/30-day limits.
- **`/api/h2/auth`:** The master gatekeeper. This endpoint translates the JSON payload sent natively by Hysteria 2 and strictly rejects any expired or data-exhausted configurations with a `401 Unauthorized`.
- **`/api/admin/stats`:** Gathers OS-level metrics (via Node.js `os` and `child_process` modules) and aggregates SQLite data to feed the Admin Dashboard.
- **`/api/sub`:** Acts as an endpoint for Hiddify to auto-update its metrics. It dynamically generates the `Subscription-Userinfo` header so mobile clients can display data limits locally.
- **Traffic Tracker (`traffic-tracker.mjs`):** A daemonized script running independently of Next.js. It queries Hysteria 2's internal memory (`127.0.0.1:9999/traffic`), calculates the `delta` of bytes transferred since the last check, and updates both the individual user's `vpn_configs` row and the global `monthly_stats` table.

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
│   │   ├── h2/                 # Hysteria 2 Auth Webhook
│   │   ├── sub/                # Client Subscription API
│   │   └── vpn/                # User Config Generation
│   ├── dashboard/              # User Dashboard UI
│   └── globals.css             # Tailwind & Global Styles
├── components/                 # React UI Components
│   ├── AdminDashboard.tsx      # Core Admin Interface
│   ├── Dashboard.tsx           # Core User Interface
│   ├── GlassCard.tsx           # Premium UI Wrapper
│   └── ui/                     # Shadcn Primitives (Buttons, Badges, etc.)
├── lib/                        # Shared Utilities
│   ├── auth.ts                 # NextAuth Configuration
│   └── db.ts                   # SQLite Database Initialization & Migrations
├── prisma/                     # Database Directory
│   └── dev.db                  # SQLite Database File (Production State)
└── traffic-tracker.mjs         # Background Telemetry Sync Daemon

/etc/hysteria/                  # OS-Level VPN Engine Config
├── main.yaml                   # Core Hysteria 2 Configuration (Port 8388)
├── server.crt                  # Self-Signed Stealth Certificate
└── server.key                  # TLS Key
```

---

## 6. Operational Commands

### Process Management
- **VPN Engine:** `sudo systemctl restart hysteria-main`
- **Telemetry Tracker:** `sudo systemctl restart stealthvpn-tracker`
- **Web App:** `sudo systemctl restart stealthvpn`

### Troubleshooting & Logs
- **VPN Traffic/Errors:** `sudo journalctl -u hysteria-main -f`
- **Web App Errors:** `sudo journalctl -u stealthvpn -f`
- **Tracker Sync Status:** `sudo journalctl -u stealthvpn-tracker -f`

---

**🌶️ Stay Spicy. Stay Fast.**