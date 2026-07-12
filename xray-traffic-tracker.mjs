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
let pendingTraffic = {}; 
let cycleCounter = 0; 

function flushTraffic() {
  const entries = Object.entries(pendingTraffic);
  if (entries.length === 0) return;
  const now = Math.floor(Date.now() / 1000);
  const monthStr = new Date().toISOString().substring(0, 7);
  let totalUp = 0, totalDown = 0;

  db.transaction(() => {
    for (const [token, t] of entries) {
      db.prepare(`UPDATE vpn_configs SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ? WHERE token = ?`)
        .run(t.up, t.down, t.lastActive, token);
      totalUp += t.up;
      totalDown += t.down;
    }
    db.prepare(`INSERT OR IGNORE INTO monthly_stats (month, totalUp, totalDown) VALUES (?, 0, 0)`).run(monthStr);
    db.prepare(`UPDATE monthly_stats SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE month = ?`).run(totalUp, totalDown, monthStr);
    db.prepare(`INSERT OR IGNORE INTO node_bandwidth (nodeId, month, totalUp, totalDown) VALUES ('node-1', ?, 0, 0)`).run(monthStr);
    db.prepare(`UPDATE node_bandwidth SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE nodeId = 'node-1' AND month = ?`).run(totalUp, totalDown, monthStr);
  })();
  pendingTraffic = {};
}

async function syncAndTrack() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const monthStr = new Date().toISOString().substring(0, 7);

    // 1. Get all active users from DB assigned specifically to the master node
    const activeUsers = db.prepare(`
      SELECT * FROM vpn_configs 
      WHERE active = 1 AND expiresAt > ? AND (totalUp + totalDown) < dataLimit
      AND (nodeId = 'node-1' OR nodeId IS NULL)
    `).all(now);
    const activeTokens = new Set(activeUsers.map(u => u.token));

    // 2. ADD NEW USERS to Xray (Incremental - SAFE)
    const newUsers = activeUsers.filter(u => !currentKnownTokens.has(u.token));
    for (const user of newUsers) {
      for (const tag of INBOUND_TAGS) {
        const userJson = {
          inbounds: [{
            port: 8444,
            protocol: "vless",
            tag: tag,
            settings: {
              decryption: "none",
              clients: [{ id: user.uuid, email: user.token }]
            }
          }]
        };
        const tmpFile = `/tmp/sync_add_${tag}_${user.token}.json`;
        fs.writeFileSync(tmpFile, JSON.stringify(userJson));
        try {
          execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
          console.log(`[SYNC] Added user ${user.token} to ${tag}`);
          currentKnownTokens.add(user.token);
        } catch (e) {
          console.error(`[SYNC] Failed to add user ${user.token}:`, e.message);
        }
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    }

    // 3. REMOVE STALE USERS from Xray
    for (const token of [...currentKnownTokens]) {
      if (!activeTokens.has(token)) {
        console.log(`[KICKER] Removing user ${token}`);
        for (const tag of INBOUND_TAGS) {
          try {
            execSync(`xray api rmu --server=${XRAY_API} -tag=${tag} "${token}"`);
          } catch (e) {}
        }
        
        // Final DB check - ensure they are deactivated if they hit limits
        const user = db.prepare("SELECT * FROM vpn_configs WHERE token = ?").get(token);
        if (user && user.active === 1 && (user.expiresAt < now || (user.totalUp + user.totalDown) >= user.dataLimit)) {
          db.prepare("UPDATE vpn_configs SET active = 0 WHERE token = ?").run(token);
        }
        
        currentKnownTokens.delete(token);
      }
    }

    // 4. Query stats
    let data;
    try {
      const output = execSync(`xray api statsquery --server=${XRAY_API}`).toString();
      data = JSON.parse(output);
    } catch(e) {
      return;
    }
    if (!data.stat) return;

    const currentBatch = {};
    for (const item of data.stat) {
      if (item.name.startsWith('user>>>')) {
        const parts = item.name.split('>>>');
        const token = parts[1];
        const type = parts[3]; 
        if (!currentBatch[token]) currentBatch[token] = { tx: 0, rx: 0 };
        currentBatch[token][type === 'uplink' ? 'tx' : 'rx'] = parseInt(item.value) || 0;
      }
    }

    // Accumulate traffic diffs in memory (flush to DB every 60s)
    for (const [token, stats] of Object.entries(currentBatch)) {
      const prev = previousStats[token] || { tx: 0, rx: 0 };
      let diffUp = stats.tx - prev.tx;
      let diffDown = stats.rx - prev.rx;

      if (diffUp < 0) diffUp = stats.tx;
      if (diffDown < 0) diffDown = stats.rx;

      if (diffUp > 0 || diffDown > 0) {
        pendingTraffic[token] = pendingTraffic[token] || { up: 0, down: 0, lastActive: 0 };
        pendingTraffic[token].up += diffUp;
        pendingTraffic[token].down += diffDown;
        if (now > pendingTraffic[token].lastActive) pendingTraffic[token].lastActive = now;
      }
    }

    // 5. Flush accumulated traffic to DB every 6 cycles (60s)
    cycleCounter++;
    if (cycleCounter >= 6) {
      flushTraffic();
      cycleCounter = 0;
    }

    // 6. Update Master Node Telemetry
    const cpus = os.cpus();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuPct = Math.round(load[0] * 100 / cpus.length);
    const ramPct = Math.round((usedMem / totalMem) * 100);
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
syncAndTrack();
