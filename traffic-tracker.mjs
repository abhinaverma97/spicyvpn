import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'prisma/dev.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const TRAFFIC_URL = 'http://127.0.0.1:9999/traffic';
let previousStats = {};

async function trackTraffic() {
  try {
    const res = await fetch(TRAFFIC_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const now = Math.floor(Date.now() / 1000);

    const monthStr = new Date().toISOString().substring(0, 7);
    db.prepare(`INSERT OR IGNORE INTO monthly_stats (month, totalUp, totalDown) VALUES (?, 0, 0)`).run(monthStr);

    const resetResult = db.prepare(`
      UPDATE vpn_configs 
      SET totalUp = 0, totalDown = 0, lastDataResetMonth = ? 
      WHERE lastDataResetMonth IS NULL OR lastDataResetMonth != ?
    `).run(monthStr, monthStr);
    
    if (resetResult.changes > 0) {
      console.log(`[${new Date().toISOString()}] Reset data limits for ${resetResult.changes} configs for new month ${monthStr}.`);
    }

    const updateMonthly = db.prepare(`
      UPDATE monthly_stats SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE month = ?
    `);

    const updateStmt = db.prepare(`
      UPDATE vpn_configs 
      SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
      WHERE token = ?
    `);

    db.transaction(() => {
      let updated = 0;
      for (const [token, stats] of Object.entries(data)) {
        if (!token) continue; // Skip empty token mapping
        
        const prev = previousStats[token] || { tx: 0, rx: 0 };
        
        let diffTx = stats.tx - prev.tx;
        let diffRx = stats.rx - prev.rx;

        // Handle server restart (stats reset to 0)
        if (diffTx < 0) diffTx = stats.tx;
        if (diffRx < 0) diffRx = stats.rx;

        if (diffTx > 0 || diffRx > 0) {
          updateStmt.run(diffTx, diffRx, now, token);
          updateMonthly.run(diffTx, diffRx, monthStr);
          updated++;
        }
      }
      if (updated > 0) {
        console.log(`[${new Date().toISOString()}] Updated stats for ${updated} active users.`);
      }
    })();

    previousStats = data;
  } catch (error) {
    console.error("Traffic tracker error:", error.message);
  }
}

console.log("Starting Hysteria 2 traffic tracker...");
setInterval(trackTraffic, 10000); // Check every 10 seconds
