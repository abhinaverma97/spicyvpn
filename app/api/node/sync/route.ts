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

    const previousTraffic = JSON.parse(node.lastTraffic || '{}');
    const now = Math.floor(Date.now() / 1000);
    const usersToKick: string[] = [];

    // Begin transaction to update all traffic and node stats
    db.transaction(() => {
      let activeConnections = 0;

      const updateTrafficStmt = db.prepare(`
        UPDATE vpn_configs 
        SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?, nodeId = ?, lastSyncTime = ?
        WHERE uuid = ?
      `);

      const updateSyncOnlyStmt = db.prepare(`
        UPDATE vpn_configs 
        SET nodeId = ?, lastSyncTime = ?
        WHERE uuid = ?
      `);

      const getStatsStmt = db.prepare(`
        SELECT totalUp, totalDown, expiresAt FROM vpn_configs WHERE uuid = ?
      `);
if (traffic && typeof traffic === 'object') {
  const trafficEntries = Object.entries(traffic);

  for (const [uuid, stats] of trafficEntries) {
    if (!uuid) continue;

    const currentRx = (stats as any).rx || 0;
    const currentTx = (stats as any).tx || 0;
    const prev = previousTraffic[uuid] || { rx: 0, tx: 0 };

    let rxDelta = currentRx - prev.rx;
    let txDelta = currentTx - prev.tx;

    // Handle Hysteria restart or counter wrap
    if (rxDelta < 0) rxDelta = currentRx;
    if (txDelta < 0) txDelta = currentTx;

    if (rxDelta > 0 || txDelta > 0) {
      // Only count as active if they actually moved some data (not just background noise/keep-alives)
      // 1024 bytes (1KB) is a safe threshold for "real" activity in a 30s window
      if ((rxDelta + txDelta) > 1024) {
        activeConnections++;
      }
      updateTrafficStmt.run(rxDelta, txDelta, now, node.id, now, uuid);
    } else {
      // User is connected but IDLE - do not increment activeConnections
      updateSyncOnlyStmt.run(node.id, now, uuid);
    }


          const userRecord = getStatsStmt.get(uuid) as any;
          // Safety check...
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

      // Update Node heartbeat, current load, and CACHE the traffic for the next delta calculation
      db.prepare(`
        UPDATE nodes 
        SET lastHeartbeat = ?, currentLoad = ?, lastTraffic = ?
        WHERE id = ?
      `).run(now, activeConnections, JSON.stringify(traffic), node.id);
    })();

    return NextResponse.json({ ok: true, kick_users: usersToKick });

  } catch (error) {
    console.error("Node Sync Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
