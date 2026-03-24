const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'prisma/dev.db');
const db = new Database(DB_PATH);

function updateHeartbeat() {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Calculate current load on Master by counting users on THIS node active in the last 60 seconds
        const activeUsers = db.prepare(`SELECT COUNT(*) as count FROM vpn_configs WHERE nodeId = 'node-1' AND lastActive >= ?`).get(now - 60).count;

        // Update the Master node's heartbeat and load
        db.prepare(`
            UPDATE nodes 
            SET lastHeartbeat = ?, currentLoad = ?
            WHERE id = 'node-1'
        `).run(now, activeUsers);
        
    } catch (err) {
        console.error("Heartbeat error:", err);
    }
}

// Run immediately, then every 30 seconds
updateHeartbeat();
setInterval(updateHeartbeat, 30000);
