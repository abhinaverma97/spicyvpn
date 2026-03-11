import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse, NextRequest } from "next/server";

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const users = db.prepare(`
    SELECT users.*, vpn_configs.uuid, vpn_configs.token, vpn_configs.expiresAt, vpn_configs.active
    FROM users
    LEFT JOIN vpn_configs ON users.id = vpn_configs.userId
    ORDER BY users.createdAt DESC
    LIMIT 1000
  `).all();

  return NextResponse.json(users);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const db = getDb();
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin Delete Error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
