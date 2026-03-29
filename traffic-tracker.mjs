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

    const updateStmt = db.prepare(`
      UPDATE vpn_configs 
      SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
      WHERE token = ?
    `);

    db.transaction(() => {
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
        }
      }
    })();

    previousStats = data;
  } catch (error) {
    console.error("Traffic tracker error:", error.message);
  }
}

console.log("Starting Hysteria 2 traffic tracker...");
setInterval(trackTraffic, 10000); // Check every 10 seconds
