import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from "next-auth/adapters";
import { getDb } from "./db";
import { randomUUID } from "crypto";

export function SQLiteAdapter(): Adapter {
  return {
    createUser(user: Omit<AdapterUser, "id">) {
      const db = getDb();
      const id = randomUUID();
      db.prepare(`
        INSERT INTO users (id, name, email, emailVerified, image)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, user.name ?? null, user.email ?? null, user.emailVerified ? Math.floor(user.emailVerified.getTime() / 1000) : null, user.image ?? null);
      return { ...user, id } as AdapterUser;
    },

    getUser(id: string) {
      const db = getDb();
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return toUser(row);
    },

    getUserByEmail(email: string) {
      const db = getDb();
      const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
      if (!row) return null;
      return toUser(row);
    },

    getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      const db = getDb();
      const row = db.prepare(`
        SELECT u.* FROM users u
        JOIN accounts a ON a.userId = u.id
        WHERE a.provider = ? AND a.providerAccountId = ?
      `).get(provider, providerAccountId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return toUser(row);
    },

    updateUser(user: Partial<AdapterUser> & { id: string }) {
      const db = getDb();
      db.prepare(`
        UPDATE users SET name = ?, email = ?, image = ? WHERE id = ?
      `).run(user.name ?? null, user.email ?? null, user.image ?? null, user.id);
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as Record<string, unknown>;
      return toUser(row);
    },

    deleteUser(id: string) {
      const db = getDb();
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      return undefined;
    },

    linkAccount(account: AdapterAccount) {
      const db = getDb();
      const id = randomUUID();
      db.prepare(`
        INSERT INTO accounts (id, userId, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, account.userId, account.type, account.provider, account.providerAccountId,
        account.refresh_token ?? null, account.access_token ?? null, account.expires_at ?? null,
        account.token_type ?? null, account.scope ?? null, account.id_token ?? null, account.session_state ?? null);
      return account;
    },

    unlinkAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      const db = getDb();
      db.prepare("DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?").run(provider, providerAccountId);
      return undefined;
    },

    createSession(session: { sessionToken: string; userId: string; expires: Date }) {
      const db = getDb();
      const id = randomUUID();
      db.prepare(`
        INSERT INTO sessions (id, sessionToken, userId, expires)
        VALUES (?, ?, ?, ?)
      `).run(id, session.sessionToken, session.userId, Math.floor(session.expires.getTime() / 1000));
      return { ...session };
    },

    getSessionAndUser(sessionToken: string) {
      const db = getDb();
      const row = db.prepare(`
        SELECT s.*, u.id as uid, u.name, u.email, u.emailVerified, u.image
        FROM sessions s JOIN users u ON s.userId = u.id
        WHERE s.sessionToken = ?
      `).get(sessionToken) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        session: {
          sessionToken: row.sessionToken as string,
          userId: row.userId as string,
          expires: new Date((row.expires as number) * 1000),
        },
        user: {
          id: row.uid as string,
          name: row.name as string | null,
          email: row.email as string | null,
          emailVerified: row.emailVerified ? new Date((row.emailVerified as number) * 1000) : null,
          image: row.image as string | null,
        } as AdapterUser,
      };
    },

    updateSession(session: Partial<AdapterSession> & { sessionToken: string }) {
      const db = getDb();
      if (session.expires) {
        db.prepare("UPDATE sessions SET expires = ? WHERE sessionToken = ?")
          .run(Math.floor(session.expires.getTime() / 1000), session.sessionToken);
      }
      const row = db.prepare("SELECT * FROM sessions WHERE sessionToken = ?").get(session.sessionToken) as Record<string, unknown>;
      return {
        sessionToken: row.sessionToken as string,
        userId: row.userId as string,
        expires: new Date((row.expires as number) * 1000),
      };
    },

    deleteSession(sessionToken: string) {
      const db = getDb();
      db.prepare("DELETE FROM sessions WHERE sessionToken = ?").run(sessionToken);
      return undefined;
    },

    createVerificationToken(token: VerificationToken) {
      const db = getDb();
      db.prepare(`
        INSERT INTO verification_tokens (identifier, token, expires)
        VALUES (?, ?, ?)
      `).run(token.identifier, token.token, Math.floor(token.expires.getTime() / 1000));
      return token;
    },

    useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      const db = getDb();
      const row = db.prepare("SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?").get(identifier, token) as Record<string, unknown> | undefined;
      if (!row) return null;
      db.prepare("DELETE FROM verification_tokens WHERE identifier = ? AND token = ?").run(identifier, token);
      return {
        identifier: row.identifier as string,
        token: row.token as string,
        expires: new Date((row.expires as number) * 1000),
      };
    },
  };
}

function toUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: (row.email as string) ?? null,
    emailVerified: row.emailVerified ? new Date((row.emailVerified as number) * 1000) : null,
    image: (row.image as string) ?? null,
  };
}
