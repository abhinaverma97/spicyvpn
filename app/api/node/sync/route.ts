import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

    const now = Math.floor(Date.now() / 1000);
    
    // Fetch all active users assigned to this node
    const configs = db.prepare(`
      SELECT uuid, token, expiresAt, dataLimit, totalUp, totalDown 
      FROM vpn_configs 
      WHERE nodeId = ? AND active = 1 AND expiresAt > ? AND (totalUp + totalDown) < dataLimit
    `).all(node.id, now) as any[];

    // Read Master SSL Certificates
    let masterCert = "";
    let masterKey = "";
    try {
      masterCert = fs.readFileSync("/usr/local/etc/xray/certs/spicypepper.app.crt", "utf8");
      masterKey = fs.readFileSync("/usr/local/etc/xray/certs/spicypepper.app.key", "utf8");
    } catch (e) {
      console.warn("Could not read Master SSL certificates. Node will use fallback.");
    }

    return NextResponse.json({ 
      nodeName: node.name,
      masterCert,
      masterKey,
      users: configs.map(c => ({
        uuid: c.uuid,
        token: c.token,
        limit: c.dataLimit - (c.totalUp + c.totalDown)
      }))
    });
  } catch (error: any) {
    console.error("Node sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
