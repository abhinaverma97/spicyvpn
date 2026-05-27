import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'prisma/dev.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const XRAY_API = '127.0.0.1:10085';
const INBOUND_TAGS = ['vless-grpc'];

let previousStats = {}; 
let currentKnownTokens = new Set(); 

async function syncAndTrack() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const monthStr = new Date().toISOString().substring(0, 7);

    // 1. Get ALL currently active users assigned to the master node
    const activeUsers = db.prepare(`
      SELECT * FROM vpn_configs 
      WHERE active = 1 AND expiresAt > ? AND (totalUp + totalDown) < dataLimit
      AND (nodeId = 'node-1' OR nodeId IS NULL)
    `).all(now);

    // 2. Perform Declarative Batch Sync
    // This pushes the entire desired state to Xray in one go.
    for (const tag of INBOUND_TAGS) {
      const userJson = {
        inbounds: [{
          port: 8444,
          protocol: "vless",
          tag: tag,
          settings: {
            decryption: "none",
            clients: activeUsers.map(u => ({ id: u.uuid, email: u.token }))
          },
          streamSettings: {
            network: "grpc",
            security: "tls",
            tlsSettings: {
              alpn: ["h2"],
              certificates: [{
                certificateFile: "/usr/local/etc/xray/certs/spicypepper.app.crt",
                keyFile: "/usr/local/etc/xray/certs/spicypepper.app.key"
              }]
            },
            grpcSettings: {
              serviceName: "spicypepper-grpc"
            }
          }
        }]
      };
      
      const tmpFile = `/tmp/sync_batch_${tag}.json`;
      fs.writeFileSync(tmpFile, JSON.stringify(userJson));
      try {
        execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
      } catch (e) {
        console.error(`[SYNC] Batch failed for ${tag}:`, e.message);
      }
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    // Update our internal memory of who is authorized
    currentKnownTokens = new Set(activeUsers.map(u => u.token));

    // 3. Query stats
    let data;
    try {
      const output = execSync(`xray api statsquery --server=${XRAY_API}`).toString();
      data = JSON.parse(output);
    } catch(e) {
      console.error("[STATS] Query failed:", e.message);
      return;
    }
    if (!data.stat) return;

    const currentBatch = {};
    for (const item of data.stat) {
      if (item.name.startsWith("user>>>")) {
        const parts = item.name.split(">>>");
        const token = parts[1];
        const type = parts[3]; 
        if (!currentBatch[token]) currentBatch[token] = { uplink: 0, downlink: 0 };
        currentBatch[token][type] = (currentBatch[token][type] || 0) + parseInt(item.value) || 0;
      }
    }

    // 4. Update Database & Kicker
    db.transaction(() => {
      for (const [token, stats] of Object.entries(currentBatch)) {
        const prev = previousStats[token] || { uplink: 0, downlink: 0 };
        let diffUp = stats.uplink - prev.uplink;
        let diffDown = stats.downlink - prev.downlink;

        if (diffUp < 0) diffUp = stats.uplink;
        if (diffDown < 0) diffDown = stats.downlink;

        if (diffUp > 0 || diffDown > 0) {
          db.prepare(`
            UPDATE vpn_configs 
            SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
            WHERE token = ?
          `).run(diffUp, diffDown, now, token);

          db.prepare(`INSERT OR IGNORE INTO monthly_stats (month, totalUp, totalDown) VALUES (?, 0, 0)`).run(monthStr);
          db.prepare(`UPDATE monthly_stats SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE month = ?`).run(diffUp, diffDown, monthStr);

          // Track monthly bandwidth for the master node specifically
          db.prepare(`INSERT OR IGNORE INTO node_bandwidth (nodeId, month, totalUp, totalDown) VALUES ('node-1', ?, 0, 0)`).run(monthStr);
          db.prepare(`UPDATE node_bandwidth SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE nodeId = 'node-1' AND month = ?`).run(diffUp, diffDown, monthStr);
        }

        const user = db.prepare("SELECT * FROM vpn_configs WHERE token = ?").get(token);
        if (!user || user.active === 0 || user.expiresAt < now || (user.totalUp + user.totalDown) >= user.dataLimit) {
          console.log(`[KICKER] Removing user ${token}`);
          for (const tag of INBOUND_TAGS) {
            try {
              execSync(`xray api rmu --server=${XRAY_API} -tag=${tag} "${token}"`);
            } catch (e) {}
          }
          currentKnownTokens.delete(token);
          if (user && user.active === 1) {
            db.prepare("UPDATE vpn_configs SET active = 0 WHERE token = ?").run(token);
            console.log(`[KICKER] Deactivated user ${token} in DB.`);
          }
        }
      }
    })();

    // 4. Update Master Node Telemetry (Heartbeat)
    const cpus = os.cpus();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuPct = Math.round(load[0] * 100 / cpus.length);
    const ramPct = Math.round((usedMem / totalMem) * 100);
    
    // Accurate Live Users check matching the Admin Dashboard logic (active within last 60s)
    // Only count users explicitly assigned to the master node (or null from legacy configs)
    const liveUsersQuery = db.prepare(`SELECT COUNT(*) as count FROM vpn_configs WHERE lastActive >= ? AND (nodeId = 'node-1' OR nodeId IS NULL)`).get(now - 60);
    const liveUsersCount = liveUsersQuery ? liveUsersQuery.count : 0;

    db.prepare(`
      UPDATE nodes 
      SET lastHeartbeat = ?, cpuUsage = ?, ramUsage = ?, liveUsers = ?, status = 'active'
      WHERE id = 'node-1'
    `).run(now, cpuPct, ramPct, liveUsersCount);

    previousStats = currentBatch;
  } catch (error) {
    console.error("Tracker error:", error.message);
  }
}

console.log("Starting Continuous Xray Sync & Tracker...");
setInterval(syncAndTrack, 10000);
