import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { generateUUID, getExpiryDate } from "@/lib/vpn";
import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";

function generateToken(): string {
  return "spx_" + randomBytes(8).toString("hex");
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // Check existing active config
    const existing = db.prepare(`
      SELECT * FROM vpn_configs
      WHERE userId = ? AND active = 1 AND expiresAt > ?
      ORDER BY createdAt DESC LIMIT 1
    `).get(session.user.id, now) as any;

    if (existing) {
      const usedTraffic = (existing.totalUp || 0) + (existing.totalDown || 0);

      const { deviceCount } = db.prepare(
        "SELECT COUNT(*) as deviceCount FROM token_devices WHERE token = ?"
      ).get(existing.token) as { deviceCount: number };

      return NextResponse.json(toConfig(existing, usedTraffic, -1, deviceCount));
    }

    // Generate new config
    const uuid = generateUUID(); 
    const expiresAt = Math.floor(getExpiryDate().getTime() / 1000);
    const id = randomUUID();
    const token = generateToken();

    db.prepare(`
      INSERT INTO vpn_configs (id, userId, uuid, token, expiresAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, session.user.id, uuid, token, expiresAt);

    const config = db.prepare("SELECT * FROM vpn_configs WHERE id = ?").get(id) as any;

    // Hysteria now handles auth via OUR HTTP hook (api/h2/auth)
    // No need to call external H-UI database anymore.

    return NextResponse.json(toConfig(config, 0, -1, 0));
  } catch (error: any) {
    console.error("VPN POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const configs = db.prepare(`
      SELECT * FROM vpn_configs WHERE userId = ? ORDER BY createdAt DESC
    `).all(session.user.id) as any[];

    let usedTraffic = 0;
    let deviceCount = 0;
    
    if (configs.length > 0) {
      usedTraffic = (configs[0].totalUp || 0) + (configs[0].totalDown || 0);

      const deviceRow = db.prepare(
        "SELECT COUNT(*) as count FROM token_devices WHERE token = ?"
      ).get(configs[0].token) as { count: number };
      deviceCount = deviceRow.count;
    }

    return NextResponse.json(configs.map(row => toConfig(row, usedTraffic, -1, deviceCount)));
  } catch (error: any) {
    console.error("VPN GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function toConfig(row: any, usedTraffic = 0, dataLimit = -1, deviceCount = 0) {
  return {
    id: row.id,
    uuid: row.uuid,
    token: row.token,
    expiresAt: new Date(row.expiresAt * 1000).toISOString(),
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt * 1000).toISOString(),
    usedTraffic,
    dataLimit,
    deviceCount,
  };
}
