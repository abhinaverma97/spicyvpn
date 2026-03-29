# 🌶️ SpicyVPN (StealthVPN) - Core Infrastructure & Operations Manual

Welcome to the comprehensive documentation for **SpicyVPN**. This project has evolved from a simple tunnel into a production-grade VPN ecosystem optimized for restrictive networks (like college Wi-Fi) and high-performance gaming.

---

## 📖 Master Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Server Stack: Marzban & Xray](#2-server-stack-marzban--xray)
3. [Network Layer: VLESS-Reality](#3-network-layer-vless-reality)
4. [Control Plane: Next.js Dashboard](#4-control-plane-nextjs-dashboard)
5. [Client Ecosystem: Desktop & Hiddify](#5-client-ecosystem-desktop--hiddify)
6. [Operational Commands](#6-operational-commands)

---

## 1. Architecture Overview

SpicyVPN uses a **Stealth Proxy** architecture. Unlike traditional VPNs (OpenVPN/WireGuard) that are easily detected by Deep Packet Inspection (DPI), SpicyVPN masquerades its traffic as standard HTTPS browsing to reputable domains.

### Core Components:
- **Master Node:** Oracle Ampere A1 (ARM64), 4 OCPUs, 24GB RAM.
- **VPN Engine:** Marzban (Dockerized) running Xray-core `v24.12.31`.
- **Web Interface:** Next.js 16 (Turbopack) for user and admin dashboards.
- **Reverse Proxy:** Caddy handles SSL for `panel.spicypepper.app` and `spicypepper.app`.

---

## 2. Server Stack: Marzban & Xray

We have standardized on **Marzban** for unified user management.

- **Dashboard:** `https://panel.spicypepper.app/`
- **Xray Core:** Locked to `v24.12.31` for maximum stability with Python config parsing.
- **User Database:** `/var/lib/marzban/db.sqlite3`.
- **Inbound Configuration:** `/var/lib/marzban/xray_config.json`.
- **Key Features:**
  - Automated 35GB/30-day data caps.
  - Real-time traffic accounting.
  - Unified subscription API (`/sub/`).

---

## 3. Network Layer: VLESS-Reality

The primary protocol used is **VLESS** with **Reality** security and **XTLS-Vision** flow.

### Stealth Mechanics:
- **SNI Masquerading:** All traffic poses as a connection to `www.microsoft.com`.
- **Reality Security:** Eliminates the need for traditional TLS certificates by using a pre-shared public key and short-id, making active probing by firewalls impossible.
- **Flow control:** `xtls-rprx-vision` dynamically shapes packet timing to match real browser behavior.

### Gaming Optimizations:
- **Full-Cone NAT:** Enabled on the server to support peer-to-peer gaming and Discord voice chat.
- **XUDP (Tunable):** Standardized UDP-in-TCP tunneling for reliable performance on restrictive Wi-Fi.
- **MTU:** Fixed at `1350` to prevent fragmentation on international links.

---

## 4. Control Plane: Next.js Dashboard

The frontend acts as the bridge between the user and the Marzban backend.

### User Dashboard:
- **Identity:** Google OAuth 2.0 via Auth.js.
- **Subscription:** Generates a private proxy link that automatically imports into Hiddify.
- **Usage Tracking:** Real-time sync with Marzban to show days remaining and data left.

### Admin Dashboard (`/admin`):
- **Registry:** Full user list with live activity indicators (pulsing green dot).
- **Health:** Real-time hardware telemetry (CPU, RAM, Disk, Total Tunneled Data).
- **Style:** Matched to the main site's "Elite Stealth" aesthetic.

---

## 5. Client Ecosystem

### Desktop Client (SpicyVPN Desktop)
- **Tech Stack:** Tauri v2 + React + Rust.
- **Engine:** Integrated `sing-box` sidecar.
- **Performance:** Native TUN interface, GVisor stack for non-admin compatibility.
- **Features:** Real-time log viewer, auto-update, and 1-click connect.

### Mobile / Alternative
- **Hiddify:** Official recommendation for Windows, Android, and iOS.
- **Config:** Import via subscription link (`api/sub?token=...`).

---

## 6. Operational Commands

### Process Management
- **Next.js App:** `sudo systemctl restart stealthvpn`
- **Logs:** `sudo journalctl -u stealthvpn -f`
- **Marzban Engine:** 
  ```bash
  cd /opt/marzban && sudo docker compose restart
  ```

### Directory Map
- `/home/ubuntu/.openclaw/workspace/stealthvpn`: Web source code.
- `/opt/marzban`: Marzban deployment files.
- `/var/lib/marzban`: Xray configs and user databases.
- `/etc/caddy/Caddyfile`: Reverse proxy rules.

---

**🌶️ Stay Spicy. Stay Stealth.**
