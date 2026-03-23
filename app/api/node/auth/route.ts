import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

const TRAFFIC_LIMIT = 35 * 1024 * 1024 * 1024; // 35GB

export async function POST(req: NextRequest) {
  try {
    const { auth, apiKey } = await req.json();
    
    if (!auth || !apiKey) {
      return NextResponse.json({ ok: false, error: "Missing auth or apiKey" }, { status: 400 });
    }

    const db = getDb();
    
    // Verify Node API Key
    const node = db.prepare(`SELECT * FROM nodes WHERE apiKey = ? AND status = 'active'`).get(apiKey);
    if (!node) {
      return NextResponse.json({ ok: false, error: "Invalid Node API Key" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);

    // 1. Find the config in our DB
    const config = db.prepare(`
      SELECT * FROM vpn_configs 
      WHERE uuid = ? AND active = 1 AND expiresAt > ?
    `).get(auth, now) as any;

    if (!config) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 2. Check Traffic Limit using persistent DB tracking
    const totalUsed = (config.totalUp || 0) + (config.totalDown || 0);
    if (totalUsed >= TRAFFIC_LIMIT) {
      return NextResponse.json({ ok: false, reason: "limit exceeded" }, { status: 403 });
    }

    // 3. Success
    return NextResponse.json({ ok: true, id: auth });

  } catch (error) {
    console.error("Node Auth Hook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
