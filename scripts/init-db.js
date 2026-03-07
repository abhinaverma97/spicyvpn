const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "../prisma/dev.db");
const db = new Database(DB_PATH);

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

  CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (identifier, token)
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
`);

console.log("Database initialized successfully at", DB_PATH);
