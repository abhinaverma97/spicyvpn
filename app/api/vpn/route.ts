import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";

function generateToken(): string {
  return "spx_" + randomBytes(8).toString("hex");
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  
  const rows = db.prepare(`
    SELECT vc.*, 
      (SELECT COUNT(*) FROM token_devices td WHERE td.token = vc.token) as deviceCount
    FROM vpn_configs vc 
    WHERE vc.userId = ? 
    ORDER BY vc.createdAt DESC
  `).all(session.user.id) as any[];

  return NextResponse.json(rows.map(row => ({
    id: row.id,
    uuid: row.uuid,
    token: row.token,
    expiresAt: new Date(row.expiresAt * 1000).toISOString(),
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt * 1000).toISOString(),
    usedTraffic: (row.totalUp || 0) + (row.totalDown || 0),
    dataLimit: row.dataLimit || (35 * 1024 * 1024 * 1024),
    deviceCount: row.deviceCount || 0,
  })));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  
  const existing = db.prepare("SELECT * FROM vpn_configs WHERE userId = ? AND active = 1").get(session.user.id) as any;
  if (existing) {
    const isExpired = existing.expiresAt < now;
    const isDataLimitReached = (existing.totalUp + existing.totalDown) >= (existing.dataLimit || (35 * 1024 * 1024 * 1024));

    if (isExpired || isDataLimitReached) {
      db.prepare("UPDATE vpn_configs SET active = 0 WHERE id = ?").run(existing.id);
    } else {
      return NextResponse.json({ error: "Active configuration already exists" }, { status: 400 });
    }
  }

  const id = randomUUID();
  const uuid = randomUUID(); // Kept for legacy DB structure
  const token = generateToken();
  const expiresAt = now + (30 * 24 * 60 * 60); // 30 days
  const dataLimit = 35 * 1024 * 1024 * 1024; // 35GB
  const monthStr = new Date().toISOString().substring(0, 7);

  db.prepare(`
    INSERT INTO vpn_configs (id, userId, uuid, token, expiresAt, active, createdAt, dataLimit, lastDataResetMonth)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, session.user.id, uuid, token, expiresAt, now, dataLimit, monthStr);

  return NextResponse.json({
    id,
    uuid,
    token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    active: true,
    createdAt: new Date(now * 1000).toISOString(),
    usedTraffic: 0,
    dataLimit,
    deviceCount: 0,
  });
}
