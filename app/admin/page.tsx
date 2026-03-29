import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    redirect("/");
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const totalUsers = (db.prepare("SELECT COUNT(DISTINCT userId) as c FROM vpn_configs").get() as { c: number }).c;
  const activeConfigs = (db.prepare("SELECT COUNT(*) as c FROM vpn_configs WHERE active = 1 AND expiresAt > ?").get(now) as { c: number }).c;
  const expiredConfigs = (db.prepare("SELECT COUNT(*) as c FROM vpn_configs WHERE expiresAt <= ?").get(now) as { c: number }).c;
  const totalConfigs = (db.prepare("SELECT COUNT(*) as c FROM vpn_configs").get() as { c: number }).c;

  const users = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.createdAt,
      v.uuid,
      v.token,
      v.expiresAt,
      v.active,
      v.lastActive,
      v.createdAt as configCreatedAt,
      (SELECT COUNT(*) FROM token_devices td WHERE td.token = v.token) as deviceCount
    FROM users u
    LEFT JOIN vpn_configs v ON v.userId = u.id AND v.active = 1
    ORDER BY u.createdAt DESC
  `).all() as Record<string, unknown>[];

  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY createdAt ASC`).all();

  return (
    <AdminDashboard
      users={users.map(u => ({
        id: u.id as string,
        email: u.email as string,
        name: u.name as string,
        joinedAt: new Date((u.createdAt as number) * 1000).toISOString(),
        token: u.token as string | null,
        uuid: u.uuid as string | null,
        expiresAt: u.expiresAt ? new Date((u.expiresAt as number) * 1000).toISOString() : null,
        active: Boolean(u.active),
        deviceCount: 0,
        lastActive: Number(u.lastActive || 0),
        usedTraffic: 0,
        dataLimit: -1,
      }))}

    />
  );
}
