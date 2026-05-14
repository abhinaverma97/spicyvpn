import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

export function getDb(): Database.Database {
  if (!(globalThis as any)._db) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    // Add busy timeout to prevent "database is locked" errors
    db.pragma("busy_timeout = 5000");
    initSchema(db);
    (globalThis as any)._db = db;
  }
  return (globalThis as any)._db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      emailVerified INTEGER,
      image TEXT,
      createdAt INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      providerAccountId TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(provider, providerAccountId)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      sessionToken TEXT UNIQUE NOT NULL,
      userId TEXT NOT NULL,
      expires INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vpn_configs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      uuid TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE,
      expiresAt INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      createdAt INTEGER DEFAULT (unixepoch()),
      totalUp INTEGER DEFAULT 0,
      totalDown INTEGER DEFAULT 0,
      lastActive INTEGER DEFAULT 0,
      nodeId TEXT DEFAULT NULL,
      lastSyncTime INTEGER DEFAULT 0,
      dataLimit INTEGER DEFAULT 53687091200,
      lastDataResetMonth TEXT DEFAULT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS token_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      ip TEXT NOT NULL,
      firstSeen INTEGER DEFAULT (unixepoch()),
      lastSeen INTEGER DEFAULT (unixepoch()),
      UNIQUE(token, ip)
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT UNIQUE NOT NULL,
      apiKey TEXT UNIQUE NOT NULL,
      maxCapacity INTEGER DEFAULT 100,
      currentLoad INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      lastHeartbeat INTEGER DEFAULT 0,
      lastTraffic TEXT DEFAULT '{}',
      cpuUsage REAL DEFAULT 0,
      ramUsage REAL DEFAULT 0,
      liveUsers INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS monthly_stats (
      month TEXT PRIMARY KEY,
      totalUp INTEGER DEFAULT 0,
      totalDown INTEGER DEFAULT 0
    );
  `);

  // Simple migrations for existing tables
  try {
    const tableInfo = db.pragma("table_info(vpn_configs)") as any[];
    const columns = tableInfo.map(c => c.name);
    
    if (!columns.includes("totalUp")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN totalUp INTEGER DEFAULT 0;");
    }
    if (!columns.includes("totalDown")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN totalDown INTEGER DEFAULT 0;");
    }
    if (!columns.includes("lastActive")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN lastActive INTEGER DEFAULT 0;");
    }
    if (!columns.includes("nodeId")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN nodeId TEXT DEFAULT NULL;");
    }
    if (!columns.includes("lastSyncTime")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN lastSyncTime INTEGER DEFAULT 0;");
    }
    if (!columns.includes("dataLimit")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN dataLimit INTEGER DEFAULT 53687091200;");
    }
    if (!columns.includes("lastDataResetMonth")) {
      db.exec("ALTER TABLE vpn_configs ADD COLUMN lastDataResetMonth TEXT DEFAULT NULL;");
    }

    const nodeTableInfo = db.pragma("table_info(nodes)") as any[];
    const nodeColumns = nodeTableInfo.map(c => c.name);
    if (!nodeColumns.includes("lastTraffic")) {
      db.exec("ALTER TABLE nodes ADD COLUMN lastTraffic TEXT DEFAULT '{}';");
    }
    if (!nodeColumns.includes("cpuUsage")) {
      db.exec("ALTER TABLE nodes ADD COLUMN cpuUsage REAL DEFAULT 0;");
    }
    if (!nodeColumns.includes("ramUsage")) {
      db.exec("ALTER TABLE nodes ADD COLUMN ramUsage REAL DEFAULT 0;");
    }
    if (!nodeColumns.includes("liveUsers")) {
      db.exec("ALTER TABLE nodes ADD COLUMN liveUsers INTEGER DEFAULT 0;");
    }

    // Insert default node if nodes table is empty
    const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number };
    if (nodeCount.count === 0) {
      db.prepare(`
        INSERT INTO nodes (id, name, ip, apiKey, maxCapacity, status, lastHeartbeat)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("node-1", "Frankfurt-1 (Master)", "140.245.13.64", "master-default-key-replace-me", 100, "active", Math.floor(Date.now() / 1000));
    }
  } catch (error) {
    console.error("Migration error:", error);
  }
}

export function getBestNode(): any {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  // A node is considered offline if it hasn't checked in for 2 minutes
  const node = db.prepare(`
    SELECT * FROM nodes 
    WHERE status = 'active' AND lastHeartbeat > ? 
    ORDER BY liveUsers ASC 
    LIMIT 1
  `).get(now - 120);

  if (node) return node;

  // Fallback to any active node if no heartbeat is fresh
  return db.prepare(`
    SELECT * FROM nodes 
    WHERE status = 'active' 
    ORDER BY liveUsers ASC 
    LIMIT 1
  `).get();
}
