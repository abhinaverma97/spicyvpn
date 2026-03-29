# 🌶️ SpicyVPN (StealthVPN) - Hysteria 2 Infrastructure

Welcome to the comprehensive documentation for **SpicyVPN**. This project has fully migrated to the **Hysteria 2** protocol, providing peak performance on high-latency and restrictive networks.

---

## 📖 Master Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Server Stack: Hysteria 2](#2-server-stack-hysteria-2)
3. [Network Layer: Port 2053](#3-network-layer-port-2053)
4. [Control Plane: Next.js Dashboard](#4-control-plane-nextjs-dashboard)
5. [Client Ecosystem: Hiddify](#5-client-ecosystem-hiddify)
6. [Operational Commands](#6-operational-commands)

---

## 1. Architecture Overview

SpicyVPN has transitioned from a proxy-based system to a high-speed **UDP-based tunneling** architecture using Hysteria 2. This allows for superior performance in gaming and real-time communication.

### Core Components:
- **Master Node:** Oracle Ampere A1 (ARM64), 4 OCPUs, 24GB RAM.
- **VPN Engine:** Standalone **Hysteria 2** (Binary) with HTTP Authentication.
- **Web Interface:** Next.js 16 (Turbopack) for user and admin dashboards.
- **Reverse Proxy:** Caddy handles SSL for the web panel and dashboard.

---

## 2. Server Stack: Hysteria 2

We have decommissioned Marzban and standardized on native Hysteria 2 for its simplicity and raw speed.

- **Main Config:** `/etc/hysteria/main.yaml`
- **Authentication:** Integrated via Next.js API (`/api/h2/auth`).
- **Stats Tracking:** Handled via local HTTP stats endpoint on port 9999.
- **Key Features:**
  - Standardized 35GB/30-day data caps enforced at the gateway.
  - Real-time user authentication directly against the SQLite database.
  - Brutal congestion control optimized for restricted Wi-Fi.

---

## 3. Network Layer: Port 2053

The primary production gateway is now listening on **Port 2053**.

### Why 2053?
- **Obfuscation:** Commonly used for cloud management, making it less likely to be blocked than standard VPN ports.
- **UDP Performance:** Hysteria 2 leverages the full power of UDP to eliminate Head-of-Line blocking.
- **Auto-Update:** Clients automatically refresh their configuration every 1 hour via the `Profile-Update-Interval` header.

---

## 4. Control Plane: Next.js Dashboard

The frontend serves as the centralized management console.

### User Dashboard:
- **Subscription:** Generates **`hy2://`** links compatible with Hiddify.
- **Usage:** Displays real-time data remaining and expiration dates.

### Admin Dashboard (`/admin`):
- **Minimalist Design:** Professional, high-density dashboard for fleet oversight.
- **Live Monitoring:** Real-time tracking of active connections and total network throughput.
- **User Management:** Full CRUD operations for access keys.

---

## 5. Client Ecosystem

### Official Recommendation: Hiddify
- **Platforms:** Windows, Android, iOS, macOS.
- **Config:** Import via subscription link (`api/sub?token=...`).
- **Mode:** For best results, use **VPN Mode** (Admin required on Windows).

---

## 6. Operational Commands

### Process Management
- **Hysteria Main:** `sudo systemctl restart hysteria-main`
- **Hysteria Test:** `sudo systemctl restart hysteria2`
- **Next.js App:** `sudo systemctl restart stealthvpn`
- **Check Logs:** `sudo journalctl -u hysteria-main -f`

### Directory Map
- `/etc/hysteria`: Server configuration and SSL keys.
- `/home/ubuntu/.openclaw/workspace/stealthvpn`: Web source code.
- `/var/lib/marzban`: Legacy data (Read-only).

---

**🌶️ Stay Spicy. Stay Fast.**
