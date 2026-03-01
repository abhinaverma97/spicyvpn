# SpicyVPN Desktop App

Minimal desktop VPN client built with Tauri (Rust) + HTML/CSS/JS.

## Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) (for Tauri CLI)
- Windows: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Win11)
- macOS: Xcode Command Line Tools

## Setup

```bash
# Install Tauri CLI
npm install

# Install Rust dependencies (auto on first build)
cd src-tauri && cargo fetch
```

## Add Xray Binary

Download the Xray binary for your platform and place it in `src-tauri/binaries/`:

- **Windows:** https://github.com/XTLS/Xray-core/releases → `xray-windows-64.zip` → rename to `xray.exe`
- **macOS (Intel):** `xray-macos-64.zip` → rename to `xray`
- **macOS (Apple Silicon):** `xray-macos-arm64-v8a.zip` → rename to `xray`
- **Linux:** `xray-linux-64.zip` → rename to `xray`

```bash
mkdir -p src-tauri/binaries
# Place your xray binary here
```

## Run (Development)

```bash
npm run dev
```

## Build (Production)

```bash
npm run build
```

**Output:**
- Windows: `src-tauri/target/release/bundle/msi/SpicyVPN_1.0.0_x64_en-US.msi`
- macOS: `src-tauri/target/release/bundle/dmg/SpicyVPN_1.0.0_x64.dmg`
- Linux: `src-tauri/target/release/bundle/appimage/spicyvpn_1.0.0_amd64.AppImage`

## How It Works

1. User pastes their `spx_xxxx` token from **spicypepper.app**
2. App calls `GET https://spicypepper.app/api/connect?token=spx_xxxx`
3. Server returns JSON config (server IP, UUID, keys)
4. App launches bundled Xray binary with that config
5. Xray runs a local SOCKS5 proxy on `127.0.0.1:10808`
6. App sets system proxy to route all traffic through Xray
7. Connected ✓

## App Size

~8MB (Tauri) vs ~150MB (Electron) — very lightweight.
