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
  const nodes = db.prepare(`
    SELECT n.*, 
      IFNULL((SELECT SUM(totalUp + totalDown) FROM vpn_configs WHERE nodeId = n.id), 0) as assignedTraffic
    FROM nodes n 
    ORDER BY n.createdAt DESC
  `).all();
  return NextResponse.json(nodes);
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
