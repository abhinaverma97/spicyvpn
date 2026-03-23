import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

const TRAFFIC_LIMIT = 35 * 1024 * 1024 * 1024; // 35GB

export async function POST(req: NextRequest) {
  try {
    const { apiKey, traffic } = await req.json();
    
    if (!apiKey) {
      return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });
    }

    const db = getDb();
    
    // Verify Node API Key
    const node = db.prepare(`SELECT * FROM nodes WHERE apiKey = ? AND status = 'active'`).get(apiKey) as any;
    if (!node) {
      return NextResponse.json({ error: "Invalid Node API Key" }, { status: 403 });
    }

    const now = Math.floor(Date.now() / 1000);
    const usersToKick: string[] = [];

    // Begin transaction to update all traffic and node stats
    db.transaction(() => {
      let activeConnections = 0;

      const updateStmt = db.prepare(`
        UPDATE vpn_configs 
        SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
        WHERE uuid = ?
      `);

      const getStatsStmt = db.prepare(`
        SELECT totalUp, totalDown, expiresAt FROM vpn_configs WHERE uuid = ?
      `);

      if (traffic && typeof traffic === 'object') {
        for (const [uuid, stats] of Object.entries(traffic)) {
          if (!uuid) continue;
          
          activeConnections++;
          
          const rx = (stats as any).rx || 0;
          const tx = (stats as any).tx || 0;
          
          if (rx > 0 || tx > 0) {
            updateStmt.run(rx, tx, now, uuid);
          }

          // Always check if they exceeded limit, expired, or were deleted
          const userRecord = getStatsStmt.get(uuid) as any;
          if (userRecord) {
            const totalUsed = (userRecord.totalUp || 0) + (userRecord.totalDown || 0);
            if (totalUsed >= TRAFFIC_LIMIT || userRecord.expiresAt < now) {
              usersToKick.push(uuid);
            }
          } else {
            // User not in DB (deleted by admin), kick them immediately
            usersToKick.push(uuid);
          }
        }
      }

      // Update Node heartbeat and current load
      db.prepare(`
        UPDATE nodes 
        SET lastHeartbeat = ?, currentLoad = ?
        WHERE id = ?
      `).run(now, activeConnections, node.id);
    })();

    return NextResponse.json({ ok: true, kick_users: usersToKick });

  } catch (error) {
    console.error("Node Sync Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
