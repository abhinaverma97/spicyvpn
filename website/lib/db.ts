import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
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
      UNIQUE(provider, providerAccountId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
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
      token TEXT UNIQUE NOT NULL,
      expires INTEGER NOT NULL,
      UNIQUE(identifier, token)
    );

    CREATE TABLE IF NOT EXISTS vpn_configs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      uuid TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE,
      importLink TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      createdAt INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}
