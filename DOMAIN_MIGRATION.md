# SpicyVPN Domain Migration Guide

Checklist of everything that must change when migrating from `spicypepper.app` to a new domain.

---

## Part 1: Master Server OS (SSH Required)

### 1. Caddy (`/etc/caddy/Caddyfile`)

Caddy reverse-proxies the Next.js dashboard and handles SSL termination for the web API.

- Replace `spicypepper.app` with your new domain
- Run `sudo systemctl restart caddy` to fetch new Let's Encrypt certs

### 2. SSL Cert Sync Script (`/usr/local/bin/sync-xray-certs.sh`)

Copies Caddy's auto-renewed certs into Xray's folder so the sync endpoint can serve them to remote nodes. With `allowInsecure=1` this is optional — nodes will work with any cert.

- Update the `CADDY_CRT` and `CADDY_KEY` paths to the new domain's Caddy cert directory
- Update the `XRAY_CRT` and `XRAY_KEY` output paths
- After updating, run the script manually: `sudo /usr/local/bin/sync-xray-certs.sh`

### 3. Environment Variables (`/home/ubuntu/.openclaw/workspace/stealthvpn/.env`)

| Variable | Current | New |
|----------|---------|-----|
| `NEXT_PUBLIC_APP_URL` | `https://spicypepper.app` | `https://newdomain.com` |
| `AUTH_URL` | `https://spicypepper.app` | `https://newdomain.com` |
| `NEXTAUTH_URL` | `https://spicypepper.app` | `https://newdomain.com` |

Then restart: `sudo systemctl restart stealthvpn`

---

## Part 2: Next.js Codebase (in repo)

### 1. Node Sync API (`app/api/node/sync/route.ts`)

Line 35-36: Update `fs.readFileSync` paths to new cert filenames.

### 2. Subscription Link Generator (`app/api/sub/route.ts`)

Line 51: Update `serviceName=spicypepper-grpc` if changing the gRPC path (optional — it's just an opaque string, no reason to change).

**Note:** The `sni=` is already randomized from a pool (google.com, youtube.com, etc.) and `allowInsecure=1` is set. The SNI field is no longer tied to the domain. No change needed for `sni` during domain migration.

### 3. Admin API (`app/api/admin/nodes/route.ts`)

Line 85: Update the `"https://spicypepper.app"` fallback string in the `installCommand` template.

### 4. Node Installer Script (`public/api/node/install.sh`)

Line 87: Update `-subj "/CN=spicypepper.app"` to the new domain (self-signed fallback cert).

Line 119: Update `"serviceName": "spicypepper-grpc"` only if changing the gRPC path (optional).

---

## Part 3: External Infrastructure

### 1. Cloudflare Worker (Subscription Proxy)

The Worker at `proud-union-953f.octd258.workers.dev` fetches subscription data from the master.

- Edit the Worker code in Cloudflare Dashboard
- Change `fetch()` target from `https://spicypepper.app/api/sub` to `https://newdomain.com/api/sub`

### 2. Cloudflare DNS

- Add A record for `newdomain.com` pointing to master IP (`140.245.13.64`)
- Wait for propagation, then remove old `spicypepper.app` records

### 3. Desktop Client (`stealthvpn-desktop` repo)

If the Tauri app has hardcoded fallback URLs:

- Search `src/` for `spicypepper.app` and update
- Bump version in `package.json` and `tauri.conf.json`
- Push tag, let GitHub Actions build new `.exe`

---

## Migration Verification

1. Confirm Caddy serves the new domain: `curl -I https://newdomain.com`
2. Confirm the sub endpoint works through the Worker: `curl https://proud-union-953f.octd258.workers.dev/?token=<test_token>`
3. Confirm Xray has the new cert: `ls /usr/local/etc/xray/certs/`
4. Generate a fresh config on the dashboard, import into Hiddify, verify connection
