const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'prisma/dev.db'));

const now = Math.floor(Date.now() / 1000);
const ACTIVE_THRESHOLD = now - 90;

console.log('--- NODE REPORTED LOAD (currentLoad) ---');
const nodes = db.prepare("SELECT id, name, currentLoad FROM nodes").all();
console.table(nodes);

console.log('\n--- USERS BY ACTIVITY ---');
const userStats = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM vpn_configs WHERE lastActive >= ?) as moving_data_users,
    (SELECT COUNT(*) FROM vpn_configs WHERE lastSyncTime >= ?) as connected_sessions,
    (SELECT COUNT(*) FROM vpn_configs WHERE active = 1) as total_active_configs
`).get(ACTIVE_THRESHOLD, ACTIVE_THRESHOLD);
console.table([userStats]);

console.log('\n--- RECENT ACTIVITY SAMPLE ---');
const sample = db.prepare(`
  SELECT 
    uuid, 
    datetime(lastActive, 'unixepoch') as last_active,
    datetime(lastSyncTime, 'unixepoch') as last_sync,
    (totalUp + totalDown) as traffic
  FROM vpn_configs 
  WHERE lastSyncTime >= ? 
  ORDER BY lastActive DESC 
  LIMIT 10
`).all(ACTIVE_THRESHOLD);
console.table(sample);
