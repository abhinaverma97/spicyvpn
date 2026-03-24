const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'prisma/dev.db'));

const nodes = db.prepare("SELECT lastTraffic FROM nodes").all();
nodes.forEach((node, i) => {
  const traffic = JSON.parse(node.lastTraffic || '{}');
  console.log(`Node ${i} traffic entries: ${Object.keys(traffic).length}`);
  const sample = Object.entries(traffic).slice(0, 5);
  console.log('Sample data:', JSON.stringify(sample, null, 2));
});
