import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { NextResponse, NextRequest } from "next/server";

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";
const DATA_LIMIT_FALLBACK = 50 * 1024 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));
  const q = searchParams.get('q')?.trim() || '';
  const filter = searchParams.get('filter') || '';
  const sort = searchParams.get('sort') || '';
  const offset = (page - 1) * pageSize;

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const ACTIVE_THRESHOLD = now - 60;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filter === 'live') {
    conditions.push("vpn_configs.lastActive >= ?");
    params.push(ACTIVE_THRESHOLD);
  } else if (filter === 'active') {
    conditions.push("vpn_configs.expiresAt > ?");
    conditions.push("(vpn_configs.totalUp + vpn_configs.totalDown) < CASE WHEN vpn_configs.dataLimit > 0 THEN vpn_configs.dataLimit ELSE ? END");
    params.push(now, DATA_LIMIT_FALLBACK);
  }

  if (q) {
    conditions.push("(users.name LIKE ? OR users.email LIKE ? OR vpn_configs.token LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM users
    LEFT JOIN vpn_configs ON users.id = vpn_configs.userId AND vpn_configs.active = 1
    ${whereClause}
  `).get(...params) as any;

  const total = countRow.count;

  const activeSubsRow = db.prepare(`
    SELECT COUNT(*) as count FROM vpn_configs
    WHERE active = 1 AND expiresAt > ?
    AND (totalUp + totalDown) < CASE WHEN dataLimit > 0 THEN dataLimit ELSE ? END
  `).get(now, DATA_LIMIT_FALLBACK) as any;

  const liveUsersRow = db.prepare(`
    SELECT COUNT(*) as count FROM vpn_configs
    WHERE lastActive >= ?
  `).get(ACTIVE_THRESHOLD) as any;

  let orderBy = "vpn_configs.lastActive DESC, vpn_configs.totalUp + vpn_configs.totalDown DESC";
  if (sort === 'newest') {
    orderBy = "users.createdAt DESC";
  }

  const dbUsers = db.prepare(`
    SELECT 
      users.id, users.name, users.email, users.image, users.createdAt,
      vpn_configs.token, vpn_configs.expiresAt, vpn_configs.active, vpn_configs.lastActive, vpn_configs.lastSyncTime,
      vpn_configs.totalUp, vpn_configs.totalDown, vpn_configs.dataLimit
    FROM users
    LEFT JOIN vpn_configs ON users.id = vpn_configs.userId AND vpn_configs.active = 1
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as any[];

  const users = dbUsers.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    joinedAt: new Date((u.createdAt || 0) * 1000).toISOString(),
    token: u.token || null,
    expiresAt: u.expiresAt ? new Date(u.expiresAt * 1000).toISOString() : null,
    active: Boolean(u.active),
    lastActive: u.lastActive || 0,
    usedTraffic: (u.totalUp || 0) + (u.totalDown || 0),
    dataLimit: u.dataLimit || 37580963840,
  }));

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    activeSubsCount: activeSubsRow.count,
    liveUsersCount: liveUsersRow.count,
  });
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
