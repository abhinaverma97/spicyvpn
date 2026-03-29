import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { user, password } = await req.json();

    // In our system, the 'password' is the user's private token
    const db = getDb();
    const config = db.prepare(`
      SELECT vc.*, u.email 
      FROM vpn_configs vc
      JOIN users u ON vc.userId = u.id
      WHERE vc.token = ? AND vc.active = 1
    `).get(password) as any;

    if (!config) {
      console.log(`H2 Auth Failed: Token ${password} not found or inactive`);
      return new Response("Unauthorized", { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (config.expiresAt < now) {
      console.log(`H2 Auth Failed: Token ${password} expired`);
      return new Response("Expired", { status: 403 });
    }

    // Check traffic limit (35GB)
    const TRAFFIC_LIMIT = 35 * 1024 * 1024 * 1024;
    if (config.totalUp + config.totalDown >= TRAFFIC_LIMIT) {
      console.log(`H2 Auth Failed: Token ${password} limit reached`);
      return new Response("Limit Reached", { status: 402 });
    }

    console.log(`H2 Auth Success: User ${config.email} connected`);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("H2 Auth Error:", error);
    return new Response("Internal Error", { status: 500 });
  }
}
