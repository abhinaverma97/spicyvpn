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

  // Node Load Balancing
  let selectedIp = undefined;
  try {
    // Get all active nodes that sent a heartbeat in the last 2 minutes (120s)
    // or are recently created and haven't sent one yet.
    const activeNodes = db.prepare(`
      SELECT ip, currentLoad 
      FROM nodes 
      WHERE status = 'active' 
      AND ((? - lastHeartbeat) < 120 OR lastHeartbeat = 0)
    `).all(now) as { ip: string, currentLoad: number }[];

    if (activeNodes && activeNodes.length > 0) {
      // Find node with the absolute lowest number of concurrent users
      let bestNode = activeNodes[0];

      for (let i = 1; i < activeNodes.length; i++) {
        if (activeNodes[i].currentLoad < bestNode.currentLoad) {
          bestNode = activeNodes[i];
        }
      }
      selectedIp = bestNode.ip;
    }
  } catch (e) {
    console.error("Node load balancing failed:", e);
  }

  const payload = generateHysteriaLink(config.uuid, selectedIp);
  const finalBody = Buffer.from(payload).toString("base64");

  const up = config.totalUp || 0;
  const down = config.totalDown || 0;
  const totalLimit = 35 * 1024 * 1024 * 1024; // 35GB limit

  return new NextResponse(finalBody, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Profile-Title": "SpicyVPN",
      "Profile-Update-Interval": "1",
      "Subscription-Userinfo": `upload=${up}; download=${down}; total=${totalLimit}; expire=${config.expiresAt}`,
    },
  });
}
