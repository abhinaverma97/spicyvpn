import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateUUID, generateVlessLink, getExpiryDate } from "@/lib/vpn";
import { syncXrayClients } from "@/lib/xray";
import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";

function generateToken(): string {
  return "spx_" + randomBytes(8).toString("hex");
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Check existing active config
  const existing = db.prepare(`
    SELECT * FROM vpn_configs
    WHERE userId = ? AND active = 1 AND expiresAt > ?
    ORDER BY createdAt DESC LIMIT 1
  `).get(session.user.id, now) as Record<string, unknown> | undefined;

  if (existing) {
    return NextResponse.json(toConfig(existing));
  }

  // Generate new config
  const uuid = generateUUID();
  const importLink = generateVlessLink(uuid);
  const expiresAt = Math.floor(getExpiryDate().getTime() / 1000);
  const id = randomUUID();
  const token = generateToken();

  db.prepare(`
    INSERT INTO vpn_configs (id, userId, uuid, token, importLink, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, session.user.id, uuid, token, importLink, expiresAt);

  const config = db.prepare("SELECT * FROM vpn_configs WHERE id = ?").get(id) as Record<string, unknown>;

  // Sync all active UUIDs to Xray
  syncXrayClients();

  return NextResponse.json(toConfig(config));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const configs = db.prepare(`
    SELECT * FROM vpn_configs WHERE userId = ? ORDER BY createdAt DESC
  `).all(session.user.id) as Record<string, unknown>[];

  return NextResponse.json(configs.map(toConfig));
}

function toConfig(row: Record<string, unknown>) {
  return {
    id: row.id,
    uuid: row.uuid,
    token: row.token,
    importLink: row.importLink,
    expiresAt: new Date((row.expiresAt as number) * 1000).toISOString(),
    active: Boolean(row.active),
    createdAt: new Date((row.createdAt as number) * 1000).toISOString(),
  };
}
