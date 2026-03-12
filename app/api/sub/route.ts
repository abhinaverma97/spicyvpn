import { getDb } from "@/lib/db";
import { generateHysteriaLink } from "@/lib/vpn";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Token required", { status: 400 });

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const config = db.prepare(`
    SELECT vpn_configs.*, users.email 
    FROM vpn_configs
    JOIN users ON users.id = vpn_configs.userId
    WHERE token = ? AND active = 1 AND expiresAt > ?
  `).get(token, now) as any;

  if (!config) return new NextResponse("Invalid or expired token", { status: 404 });

  // Track device connection
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
               req.headers.get("x-real-ip") || 
               "unknown";
    
    const knownDevice = db.prepare(
      "SELECT 1 FROM token_devices WHERE token = ? AND ip = ?"
    ).get(token, ip);

    if (!knownDevice) {
      db.prepare(
        "INSERT INTO token_devices (token, ip) VALUES (?, ?)"
      ).run(token, ip);
    } else {
      db.prepare(
        "UPDATE token_devices SET lastSeen = (unixepoch()) WHERE token = ? AND ip = ?"
      ).run(token, ip);
    }
  } catch (e) {
    console.error("Device tracking failed:", e);
  }

  // Generate Hysteria 2 config
  const hysteriaLink = generateHysteriaLink(config.uuid);

  const encodedBody = Buffer.from(hysteriaLink).toString("base64");
  
  const up = config.totalUp || 0;
  const down = config.totalDown || 0;
  const totalLimit = 1000 * 1024 * 1024 * 1024; // 1000GB limit

  return new NextResponse(encodedBody, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Profile-Title": "SpicyVPN",
      "Profile-Update-Interval": "1",
      "Subscription-Userinfo": `upload=${up}; download=${down}; total=${totalLimit}; expire=${config.expiresAt}`,
    },
  });
}
