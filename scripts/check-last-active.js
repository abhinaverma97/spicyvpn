const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'prisma/dev.db'));

const now = Math.floor(Date.now() / 1000);
const threshold = now - 90;

const users = db.prepare(`
  SELECT uuid, lastActive, (totalUp + totalDown) as traffic
  FROM vpn_configs 
  WHERE lastActive >= ?
`).all(threshold);

console.log(`Users with lastActive >= ${threshold} (${new Date(threshold*1000).toISOString()}): ${users.length}`);
users.forEach(u => {
    console.log(`UUID: ${u.uuid}, lastActive: ${new Date(u.lastActive*1000).toISOString()}, traffic: ${u.traffic}`);
});
