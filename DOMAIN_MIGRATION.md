# SpicyVPN Domain Migration Guide

This document outlines the comprehensive checklist of everything that must be modified if you decide to change the core domain name of the SpicyVPN network (e.g., migrating from \`spicypepper.app\` to \`newdomain.com\`).

Because the domain acts as the foundational identity for SSL certificates, API routing, and VPN SNI masking, changing it requires updates across the Master Server OS, the Next.js Codebase, and the external Cloudflare routing.

---

## Part 1: Master Server OS Configurations (SSH Required)

You must manually update these files on the Master VPS terminal.

### 1. The Caddy Web Server (\`/etc/caddy/Caddyfile\`)
Caddy manages the real SSL certificates for your web dashboard and API.
*   **Action**: Open the file and replace all instances of \`spicypepper.app\` and \`www.spicypepper.app\` with your new domain.
*   **Apply**: Run \`sudo systemctl restart caddy\` to force it to fetch the new Let's Encrypt certificates immediately.

### 2. The Automated SSL Sync Script (\`/usr/local/bin/sync-xray-certs.sh\`)
This script copies Caddy's auto-renewed certificates into Xray's folder so the VPN engine uses the real certificate.
*   **Action**: Update the \`CADDY_CERT_DIR\` path to point to the new domain's folder inside Caddy's internal data directory.
    *   *Old:* \`/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/spicypepper.app\`
    *   *New:* \`/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/newdomain.com\`
*   **Action**: Update the file names being copied from \`spicypepper.app.crt\` to \`newdomain.com.crt\`.

---

## Part 2: The Next.js Codebase (Repository Search & Replace)

You must update these files in your \`stealthvpn\` codebase and redeploy the master server. A global "Find and Replace" in your code editor for \`spicypepper.app\` is the easiest way to catch everything.

### 1. The Node Sync API (\`app/api/node/sync/route.ts\`)
This API reads the local certificate files from the disk to securely transmit them to remote nodes.
*   **Action**: Update the \`fs.readFileSync\` paths to read the new `.crt` and `.key` filenames.

### 2. The Subscription Link Generator (\`app/api/sub/route.ts\`)
This generates the VLESS connection string for Hiddify and the Desktop App.
*   **Action**: Update the \`sni=spicypepper.app\` parameter in the \`vlessLink\` variable so clients use the new domain name during the TLS handshake to bypass firewalls.

### 3. The Node Installer Script (\`public/api/node/install.sh\`)
This script configures new remote nodes.
*   **Action**: Update the \`openssl\` command that generates the temporary fallback self-signed certificate. Change \`-subj "/CN=spicypepper.app"\` to your new domain.

### 4. The Admin API (\`app/api/admin/nodes/route.ts\`)
*   **Action**: Update the \`installCommand\` string so the \`curl\` command printed in the Admin Dashboard points to the new domain.

### 5. Environment Variables (\`.env\`)
*   **Action**: Update \`NEXT_PUBLIC_APP_URL\` to point to \`https://newdomain.com\`.

---

## Part 3: External Infrastructure

### 1. The Cloudflare Worker (Subscription Proxy)
If you use a Cloudflare Worker (e.g., \`proud-union-953f...\`) to bypass strict Wi-Fi blocks when users fetch their subscription lists:
*   **Action**: Log into your Cloudflare Dashboard.
*   **Action**: Edit the worker code. Change the \`fetch()\` target URL from \`https://spicypepper.app/api/sub\` to your new domain.

### 2. The Desktop Client Repository (\`stealthvpn-desktop\`)
If the custom Rust/Tauri desktop application has hardcoded fallbacks to the old domain:
*   **Action**: Search the \`src/App.tsx\` file for \`spicypepper.app\` and update it.
*   **Apply**: Bump the version number in \`package.json\` and \`tauri.conf.json\`, push the tag to GitHub, and let GitHub Actions compile a new \`.exe\` installer for your users.

---

### Migration Verification
After completing these steps:
1. Ensure the Master Server's \`xray\` and \`xray-cert-sync.timer\` services are running without errors.
2. Verify that existing remote nodes automatically download the new certificates within 24 hours.
3. Test a subscription link update on Hiddify to verify the new \`sni\` is being injected into the connection.
