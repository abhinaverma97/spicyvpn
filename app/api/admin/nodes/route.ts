import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.email !== ADMIN_EMAIL) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getDb();
  try {
    const nodes = db.prepare(`SELECT * FROM nodes ORDER BY createdAt ASC`).all();
    return NextResponse.json(nodes);
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.email !== ADMIN_EMAIL) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { name, ip } = await req.json();
    if (!name || !ip) return new NextResponse("Missing fields", { status: 400 });

    const db = getDb();
    const id = `node-${uuidv4().substring(0, 8)}`;
    const apiKey = generateApiKey();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO nodes (id, name, ip, apiKey, maxCapacity, status, lastHeartbeat, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, ip, apiKey, 100, "active", 0, now);

    return NextResponse.json({ id, name, ip, apiKey });
  } catch (error: any) {
    console.error("Error creating node:", error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return new NextResponse("IP address already exists", { status: 400 });
    }
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
    const session = await auth();
    if (!session || session.user?.email !== ADMIN_EMAIL) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  
    try {
      const { id, status } = await req.json();
      if (!id || !status) return new NextResponse("Missing fields", { status: 400 });
  
      const db = getDb();
      db.prepare(`UPDATE nodes SET status = ? WHERE id = ?`).run(status, id);
  
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error updating node:", error);
      return new NextResponse("Internal Error", { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.email !== ADMIN_EMAIL) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) return new NextResponse("Missing fields", { status: 400 });

    const db = getDb();
    db.prepare(`DELETE FROM nodes WHERE id = ?`).run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting node:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
