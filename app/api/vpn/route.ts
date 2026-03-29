import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { getMarzbanUser, createMarzbanUser, sanitizeUsername } from "@/lib/marzban";

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
    const mUsername = sanitizeUsername(session.user.email);

    const existing = db.prepare(`
      SELECT * FROM vpn_configs
      WHERE userId = ? AND active = 1 AND expiresAt > ?
      ORDER BY createdAt DESC LIMIT 1
    `).get(session.user.id, now) as any;

    if (existing) {
      const mUser = await getMarzbanUser(existing.uuid);
      if (mUser) {
         const { deviceCount } = db.prepare(
           "SELECT COUNT(*) as deviceCount FROM token_devices WHERE token = ?"
         ).get(existing.token) as { deviceCount: number };
   
         return NextResponse.json(toConfig(existing, mUser.used_traffic || 0, mUser.data_limit || -1, deviceCount));
      }
    }

    let mUser = await getMarzbanUser(mUsername);
    if (!mUser) {
      mUser = await createMarzbanUser(mUsername);
    }

    const id = randomUUID();
    const token = generateToken();

    db.prepare(`
      INSERT INTO vpn_configs (id, userId, uuid, token, expiresAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, session.user.id, mUsername, token, mUser.expire);

    const config = db.prepare("SELECT * FROM vpn_configs WHERE id = ?").get(id) as any;

    return NextResponse.json(toConfig(config, mUser.used_traffic || 0, mUser.data_limit || -1, 0));
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
    let dataLimit = -1;
    let deviceCount = 0;
    
    if (configs.length > 0) {
      const mUser = await getMarzbanUser(configs[0].uuid);
      if (mUser) {
        usedTraffic = mUser.used_traffic || 0;
        dataLimit = mUser.data_limit || -1;
      }

      const deviceRow = db.prepare(
        "SELECT COUNT(*) as count FROM token_devices WHERE token = ?"
      ).get(configs[0].token) as { count: number };
      deviceCount = deviceRow.count;
    }

    return NextResponse.json(configs.map(row => toConfig(row, usedTraffic, dataLimit, deviceCount)));
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