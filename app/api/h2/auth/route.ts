import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

const TRAFFIC_LIMIT = 1000 * 1024 * 1024 * 1024; // 1000GB (Effectively disabled for now, was 30GB)

export async function POST(req: NextRequest) {
  try {
    const { auth } = await req.json();
    
    if (!auth) {
      return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 400 });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // 1. Find the config in our DB
    // Pass both 'auth' (uuid) and 'now' (expiry check) parameters
    const config = db.prepare(`
      SELECT * FROM vpn_configs 
      WHERE uuid = ? AND active = 1 AND expiresAt > ?
    `).get(auth, now) as any;

    if (!config) {
      console.warn(`Auth failed (No active config or expired): ${auth}`);
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 2. Check Traffic Limit using persistent DB tracking
    const totalUsed = (config.totalUp || 0) + (config.totalDown || 0);
    if (totalUsed >= TRAFFIC_LIMIT) {
      console.warn(`Auth denied (Traffic Limit Exceeded): ${auth} - Used: ${totalUsed}`);
      return NextResponse.json({ ok: false, reason: "limit exceeded" }, { status: 403 });
    }

    // 3. Success
    return NextResponse.json({ ok: true, id: auth });

  } catch (error) {
    console.error("H2 Auth Hook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
