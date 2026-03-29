import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Hysteria 2 natively sends the client password in the 'auth' field.
    // We also check 'user' and 'password' as fallbacks.
    const authToken = body.auth || body.password || body.user;

    if (!authToken) {
      return new Response("Missing credentials", { status: 400 });
    }

    const db = getDb();
    const config = db.prepare(`
      SELECT vc.*, u.email 
      FROM vpn_configs vc
      JOIN users u ON vc.userId = u.id
      WHERE vc.token = ? AND vc.active = 1
    `).get(authToken) as any;

    if (!config) {
      console.log(`H2 Auth Failed: Token ${authToken} not found or inactive`);
      return new Response("Unauthorized", { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (config.expiresAt < now) {
      console.log(`H2 Auth Failed: Token ${authToken} expired`);
      return new Response("Unauthorized", { status: 401 });
    }

    // Check traffic limit (35GB)
    const TRAFFIC_LIMIT = 35 * 1024 * 1024 * 1024;
    if (config.totalUp + config.totalDown >= TRAFFIC_LIMIT) {
      console.log(`H2 Auth Failed: Token ${authToken} limit reached`);
      return new Response("Unauthorized", { status: 401 });
    }

    console.log(`H2 Auth Success: User ${config.email} connected`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("H2 Auth Error:", error);
    return new Response("Internal Error", { status: 500 });
  }
}
