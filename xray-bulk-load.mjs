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
const INBOUND_TAG = 'vless-grpc';

async function bulkLoad() {
  console.log("Starting Xray Bulk Load...");
  const now = Math.floor(Date.now() / 1000);
  
  const activeUsers = db.prepare(`
    SELECT * FROM vpn_configs 
    WHERE active = 1 AND expiresAt > ? AND (totalUp + totalDown) < dataLimit
  `).all(now);

  console.log(`Found ${activeUsers.length} active users to load.`);

  if (activeUsers.length > 0) {
    const clients = activeUsers.map(user => ({
      id: user.uuid,
      email: user.token
    }));

    const userJson = {
      inbounds: [{
        port: 8444,
        protocol: "vless",
        tag: INBOUND_TAG,
        settings: {
          decryption: "none",
          clients: clients
        }
      }]
    };

    const tmpFile = `/tmp/xray_load_all.json`;
    fs.writeFileSync(tmpFile, JSON.stringify(userJson));

    try {
      execSync(`xray api adu --server=${XRAY_API} ${tmpFile}`);
      console.log(`Successfully loaded all users.`);
    } catch (e) {
      console.error(`Failed to bulk load users:`, e.message);
    }
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  } else {
    console.log("No users to load.");
  }

  console.log("Bulk Load completed.");
}

bulkLoad().catch(err => {
  console.error("Bulk Load Fatal Error:", err);
  process.exit(1);
});
