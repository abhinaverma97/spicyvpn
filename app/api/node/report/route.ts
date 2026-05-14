import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }
    const apiKey = authHeader.split(" ")[1];

    const db = getDb();
    const node = db.prepare("SELECT * FROM nodes WHERE apiKey = ?").get(apiKey) as any;
    if (!node) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
    }

    const body = await req.json();
    const { cpuUsage, ramUsage, liveUsers, trafficStats } = body;

    const now = Math.floor(Date.now() / 1000);
    const monthStr = new Date().toISOString().substring(0, 7);

    db.transaction(() => {
      // 1. Update Traffic for users assigned to this node first
      if (trafficStats && typeof trafficStats === 'object') {
        for (const [token, stats] of Object.entries(trafficStats) as [string, any][]) {
          const diffUp = stats.diffUp || 0;
          const diffDown = stats.diffDown || 0;

          if (diffUp > 0 || diffDown > 0) {
            db.prepare(`
              UPDATE vpn_configs 
              SET totalUp = totalUp + ?, totalDown = totalDown + ?, lastActive = ?
              WHERE token = ? AND nodeId = ?
            `).run(diffUp, diffDown, now, token, node.id);

            db.prepare(`INSERT OR IGNORE INTO monthly_stats (month, totalUp, totalDown) VALUES (?, 0, 0)`).run(monthStr);
            db.prepare(`UPDATE monthly_stats SET totalUp = totalUp + ?, totalDown = totalDown + ? WHERE month = ?`).run(diffUp, diffDown, monthStr);
          }
        }
      }

      // 2. Accurate Live Users check matching the Admin Dashboard logic (active within last 60s)
      const liveUsersQuery = db.prepare(`SELECT COUNT(*) as count FROM vpn_configs WHERE lastActive >= ? AND nodeId = ?`).get(now - 60, node.id) as any;
      const calculatedLiveUsers = liveUsersQuery ? liveUsersQuery.count : 0;

      // 3. Update Node Stats
      db.prepare(`
        UPDATE nodes 
        SET cpuUsage = ?, ramUsage = ?, liveUsers = ?, lastHeartbeat = ?, status = 'active'
        WHERE id = ?
      `).run(cpuUsage, ramUsage, calculatedLiveUsers, now, node.id);
    })();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Node report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
