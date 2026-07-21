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
  
  // To avoid Next.js impure function render warning, we compute dynamic time slightly differently
  // or accept it in a server component since this is a dynamic route anyway. 
  // We'll leave the math here but it's safe in Server Components.

  const users = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.createdAt,
      v.token,
      v.expiresAt,
      v.active,
      v.lastActive,
      v.totalUp,
      v.totalDown,
      v.dataLimit,
      v.createdAt as configCreatedAt,
      (SELECT COUNT(*) FROM token_devices td WHERE td.token = v.token) as deviceCount
    FROM users u
    LEFT JOIN vpn_configs v ON v.userId = u.id AND v.active = 1
    ORDER BY u.createdAt DESC
    LIMIT 50
  `).all() as Record<string, unknown>[];

  return (
    <AdminDashboard
      users={users.map(u => ({
        id: u.id as string,
        email: u.email as string,
        name: u.name as string,
        joinedAt: new Date((u.createdAt as number) * 1000).toISOString(),
        token: u.token as string | null,
        expiresAt: u.expiresAt ? new Date((u.expiresAt as number) * 1000).toISOString() : null,
        active: Boolean(u.active),
        deviceCount: 0,
        lastActive: Number(u.lastActive || 0),
        usedTraffic: (u.totalUp as number || 0) + (u.totalDown as number || 0),
        dataLimit: u.dataLimit as number || 37580963840,
      }))}

    />
  );
}
