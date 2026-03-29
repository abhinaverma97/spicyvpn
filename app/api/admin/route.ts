import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse, NextRequest } from "next/server";
import { getMarzbanUsers } from "@/lib/marzban";

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const dbUsers = db.prepare(`
    SELECT 
      users.id, users.name, users.email, users.image, users.createdAt,
      vpn_configs.uuid, vpn_configs.token, vpn_configs.expiresAt, vpn_configs.active, vpn_configs.lastActive, vpn_configs.lastSyncTime
    FROM users
    LEFT JOIN vpn_configs ON users.id = vpn_configs.userId AND vpn_configs.active = 1
    ORDER BY users.createdAt DESC
    LIMIT 1000
  `).all() as any[];

  try {
    const mUsers = await getMarzbanUsers();
    const mUsersMap = new Map();
    for (const u of mUsers) {
      mUsersMap.set(u.username, u);
    }

    const enrichedUsers = dbUsers.map(u => {
      // uuid in our DB is the Marzban username
      const mUser = u.uuid ? mUsersMap.get(u.uuid) : null;
      if (mUser) {
        return {
          ...u,
          usedTraffic: mUser.used_traffic || 0,
          dataLimit: mUser.data_limit || -1,
          marzbanStatus: mUser.status,
        };
      }
      return {
        ...u,
        usedTraffic: 0,
        dataLimit: -1,
        marzbanStatus: 'unknown',
      };
    });

    return NextResponse.json(enrichedUsers);
  } catch (error) {
    console.error("Failed to fetch Marzban users for admin:", error);
    // Fallback to basic DB users
    return NextResponse.json(dbUsers.map(u => ({...u, usedTraffic: 0, dataLimit: -1, marzbanStatus: 'unknown'})));
  }
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
