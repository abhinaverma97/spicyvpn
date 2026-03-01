import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const config = db.prepare(`
    SELECT * FROM vpn_configs
    WHERE token = ? AND active = 1 AND expiresAt > ?
  `).get(token, now) as Record<string, unknown> | undefined;

  if (!config) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
  }

  // Return only what the app needs — no raw import link exposed
  return NextResponse.json({
    server: process.env.XRAY_SERVER_IP,
    port: parseInt(process.env.XRAY_PORT ?? "8443"),
    uuid: config.uuid,
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: process.env.XRAY_SNI,
    publicKey: process.env.XRAY_PUBLIC_KEY,
    shortId: process.env.XRAY_SHORT_ID,
    fingerprint: "chrome",
    expiresAt: new Date((config.expiresAt as number) * 1000).toISOString(),
  });
}
