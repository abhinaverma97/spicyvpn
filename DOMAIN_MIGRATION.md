# SpicyVPN Domain Migration Guide

Checklist of everything that must change when migrating from `spicypepper.app` to `spicy.sytes.net`.

---

## Part 1: Master Server OS (SSH Required)

### 1. Caddy (`/etc/caddy/Caddyfile`)

Caddy reverse-proxies the Next.js dashboard and handles SSL termination for the web API.

- Add a site block for `spicy.sytes.net` (keep the old domain until cutover is verified)
- Run `sudo systemctl reload caddy` to fetch new Let's Encrypt certs

### 2. Environment Variables (`/home/ubuntu/.openclaw/workspace/stealthvpn/.env`)

| Variable | Current | New |
|----------|---------|-----|
| `NEXT_PUBLIC_APP_URL` | `https://spicypepper.app` | `https://spicy.sytes.net` |
| `AUTH_URL` | `https://spicypepper.app` | `https://spicy.sytes.net` |
| `NEXTAUTH_URL` | `https://spicypepper.app` | `https://spicy.sytes.net` |

Then rebuild (NEXT_PUBLIC vars are inlined at build time) and restart: `./deploy.sh` or `npm run build && sudo systemctl restart stealthvpn`

---

## Part 2: Next.js Codebase (in repo)

### 1. Node Sync API (`app/api/node/sync/route.ts`)

Certificate synchronization was removed — the route no longer reads or serves certs. No change needed.

### 2. Subscription Link Generator (`app/api/sub/route.ts`)

Line 51: Update `serviceName=spicypepper-grpc` if changing the gRPC path (optional — it's just an opaque string, no reason to change).

**Note:** The `sni=` is hardcoded to `google.com` in the code and `allowInsecure=1` is set. The SNI field is no longer tied to the domain. No change needed for `sni` during domain migration.

### 3. Admin API (`app/api/admin/nodes/route.ts`)

Line 85: The `"https://spicy.sytes.net"` fallback string in the `installCommand` template (uses `NEXT_PUBLIC_APP_URL` when set).

### 4. Node Installer Script (`public/api/node/install.sh`)

Line 94: Self-signed fallback cert uses `-subj "/CN=spicy.sytes.net"`.

---

## Part 3: External Infrastructure

### 1. Cloudflare Worker (Subscription Proxy)

The Worker at `proud-union-953f.octd258.workers.dev` fetches subscription data from the master.

- Edit the Worker code in Cloudflare Dashboard
- Change `fetch()` target from `https://spicypepper.app/api/sub` to `https://spicy.sytes.net/api/sub`

### 2. DNS

- `spicy.sytes.net` (No-IP) A record points to master IP (`140.245.13.64`)
- Wait for propagation, then remove old `spicypepper.app` records

### 3. Desktop Client (`stealthvpn-desktop` repo)

If the Tauri app has hardcoded fallback URLs:

- Search `src/` for `spicypepper.app` and update
- Bump version in `package.json` and `tauri.conf.json`
- Push tag, let GitHub Actions build new `.exe`

---

## Migration Verification

1. Confirm Caddy serves the new domain: `curl -I https://spicy.sytes.net`
2. Confirm the sub endpoint works through the Worker: `curl https://proud-union-953f.octd258.workers.dev/?token=<test_token>`
3. Generate a fresh config on the dashboard, import into Hiddify, verify connection
