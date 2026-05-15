import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const monthStr = new Date().toISOString().substring(0, 7);

  // 1. Get the absolute global total for this month
  const globalMonthlyRow = db.prepare("SELECT totalUp + totalDown as total FROM monthly_stats WHERE month = ?").get(monthStr) as { total: number } | undefined;
  const globalTotal = globalMonthlyRow?.total || 0;

  // 2. Get traffic for all specific remote nodes (excluding node-1 for now)
  const remoteTrafficRow = db.prepare(`
    SELECT SUM(totalUp + totalDown) as total 
    FROM node_bandwidth 
    WHERE month = ? AND nodeId != 'node-1'
  `).get(monthStr) as { total: number | null };
  const remoteTotal = remoteTrafficRow.total || 0;

  // 3. Fetch all nodes
  const nodes = db.prepare("SELECT * FROM nodes ORDER BY createdAt DESC").all() as any[];

  // 4. Map the traffic
  const enrichedNodes = nodes.map(n => {
    let traffic = 0;
    if (n.id === 'node-1') {
      // Master node gets the remainder (Global - All Remote Nodes)
      // This ensures legacy users and early-month history are captured correctly
      traffic = Math.max(0, globalTotal - remoteTotal);
    } else {
      // Remote nodes get their specific recorded monthly traffic
      const row = db.prepare("SELECT totalUp + totalDown as total FROM node_bandwidth WHERE nodeId = ? AND month = ?").get(n.id, monthStr) as { total: number } | undefined;
      traffic = row?.total || 0;
    }
    return { ...n, assignedTraffic: traffic };
  });

  // Calculate "Ghost Traffic" - only if it actually exists beyond what we just assigned to node-1
  // In this new logic, node-1 already covers the "Ghosts" of legacy users.
  // We only need a separate row if there's traffic from other specific regional nodes that were deleted.
  const allKnownNodesTrafficRow = db.prepare(`
    SELECT SUM(totalUp + totalDown) as total FROM node_bandwidth WHERE month = ? AND nodeId IN (SELECT id FROM nodes)
  `).get(monthStr) as { total: number | null };
  const allKnownTotal = allKnownNodesTrafficRow.total || 0;

  if (globalTotal > allKnownTotal + 1000000) { // If more than 1MB difference remains
    // This part is mostly covered by the node-1 logic now, but kept for absolute precision
  }

  return NextResponse.json(enrichedNodes);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const { name, ip } = await req.json();

  if (!name || !ip) {
    return NextResponse.json({ error: "Name and IP are required" }, { status: 400 });
  }

  const id = "node-" + randomBytes(4).toString("hex");
  const apiKey = "sp_node_" + randomBytes(16).toString("hex");

  db.prepare(`
    INSERT INTO nodes (id, name, ip, apiKey, status, lastHeartbeat)
    VALUES (?, ?, ?, ?, 'active', 0)
  `).run(id, name, ip, apiKey);

  const installCommand = `curl -sL ${process.env.NEXT_PUBLIC_APP_URL || "https://spicypepper.app"}/api/node/install.sh | sudo bash -s -- --key ${apiKey} --master ${process.env.NEXT_PUBLIC_APP_URL || "https://spicypepper.app"}`;

  return NextResponse.json({ 
    id, 
    name, 
    ip, 
    apiKey, 
    installCommand 
  });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Node ID required" }, { status: 400 });
    if (id === "node-1") return NextResponse.json({ error: "Cannot delete master node" }, { status: 400 });

    const db = getDb();
    
    // Re-assign users from this node back to master node-1 to prevent orphans
    db.prepare("UPDATE vpn_configs SET nodeId = 'node-1' WHERE nodeId = ?").run(id);
    
    // Delete the node
    db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Node Delete Error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
