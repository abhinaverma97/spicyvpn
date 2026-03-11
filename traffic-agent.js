const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'prisma/dev.db');
const HYSTERIA_API_URL = "http://127.0.0.1:8080";
const INTERVAL_MS = 30000; // 30 seconds
const TRAFFIC_LIMIT = 30 * 1024 * 1024 * 1024; // 30GB in bytes

// Open the database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

let previousTraffic = {};

async function poll() {
  try {
    const res = await axios.get(`${HYSTERIA_API_URL}/traffic`, { timeout: 5000 });
    const currentTraffic = res.data || {};
    const now = Math.floor(Date.now() / 1000);

    const updateStmt = db.prepare(`
      UPDATE vpn_configs 
      SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
      WHERE uuid = ?
    `);

    const getStatsStmt = db.prepare(`
      SELECT totalUp, totalDown, expiresAt FROM vpn_configs WHERE uuid = ?
    `);

    const usersToKick = [];

    db.transaction(() => {
      for (const [uuid, stats] of Object.entries(currentTraffic)) {
        if (!uuid) continue; // Skip empty IDs
        
        const prev = previousTraffic[uuid] || { rx: 0, tx: 0 };
        
        let upDelta = (stats.rx || 0) - (prev.rx || 0);
        let downDelta = (stats.tx || 0) - (prev.tx || 0);

        // If delta is negative, hysteria restarted
        if (upDelta < 0) upDelta = stats.rx || 0;
        if (downDelta < 0) downDelta = stats.tx || 0;

        if (upDelta > 0 || downDelta > 0) {
          updateStmt.run(upDelta, downDelta, now, uuid);
        }
        
        // Always check if they exceeded limit, expired, or were deleted
        const userRecord = getStatsStmt.get(uuid);
        if (userRecord) {
          const totalUsed = (userRecord.totalUp || 0) + (userRecord.totalDown || 0);
          if (totalUsed >= TRAFFIC_LIMIT || userRecord.expiresAt < now) {
            usersToKick.push(uuid);
          }
        } else {
          // User not in DB (deleted by admin), kick them immediately
          usersToKick.push(uuid);
        }
      }
    })();

    previousTraffic = currentTraffic;

    // Cleanup memory leak (remove disconnected UUIDs from previousTraffic object)
    const currentUuids = Object.keys(currentTraffic);
    for (const uuid in previousTraffic) {
      if (!currentUuids.includes(uuid)) {
        delete previousTraffic[uuid];
      }
    }

    // Actively kick users who exceeded the quota
    if (usersToKick.length > 0) {
      try {
        await axios.post(`${HYSTERIA_API_URL}/kick`, usersToKick, { timeout: 5000 });
        console.log(`Kicked users over quota: ${usersToKick.join(', ')}`);
      } catch (kickErr) {
        console.error("Failed to kick users:", kickErr.message);
      }
    }

  } catch (error) {
    console.error("Traffic Agent Error:", error.message);
  }
}

console.log("Starting Traffic Agent. Polling every 30s...");
poll();
setInterval(poll, INTERVAL_MS);
