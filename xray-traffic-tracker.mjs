import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

    // 1. Get all active users from DB
    const activeUsers = db.prepare(`
      SELECT * FROM vpn_configs 
      WHERE active = 1 AND expiresAt > ? AND (totalUp + totalDown) < dataLimit
    `).all(now);
    const activeTokens = new Set(activeUsers.map(u => u.token));

    // 2. ADD NEW USERS to Xray
    const newUsers = activeUsers.filter(u => !currentKnownTokens.has(u.token));
    if (newUsers.length > 0) {
      const clients = newUsers.map(user => ({
        id: user.uuid,
        email: user.token
      }));
      
      for (const tag of INBOUND_TAGS) {
        const userJson = {
          inbounds: [{
            port: 8444,
            protocol: "vless",
            tag: tag,
            settings: {
              decryption: "none",
              clients: clients
            }
          }]
        };
        const tmpFile = `/tmp/sync_add_${tag}.json`;
        fs.writeFileSync(tmpFile, JSON.stringify(userJson));
        try {
          execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
          console.log(`[SYNC] Added ${newUsers.length} users to ${tag}`);
        } catch (e) {
          console.error(`[SYNC] Failed to add to ${tag}:`, e.message);
        }
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }

      for (const u of newUsers) {
        currentKnownTokens.add(u.token);
      }
    }

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

    // 5. Cleanup loops
    for (const token of [...currentKnownTokens]) {
      if (!activeTokens.has(token)) {
        console.log(`[CLEANUP] Removing deactivated user: ${token}`);
        for (const tag of INBOUND_TAGS) {
          try {
            execSync(`xray api rmu --server=${XRAY_API} -tag=${tag} "${token}"`);
          } catch (e) {}
        }
        currentKnownTokens.delete(token);
      }
    }

    previousStats = currentBatch;
  } catch (error) {
    console.error("Tracker error:", error.message);
  }
}

console.log("Starting Continuous Xray Sync & Tracker...");
setInterval(syncAndTrack, 10000);
