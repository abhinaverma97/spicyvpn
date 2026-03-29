import { getDb } from "@/lib/db";
import { getMarzbanUser, createMarzbanUser, sanitizeUsername } from "@/lib/marzban";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const db = getDb();
    
    // Join with users table to get the email for migration if needed
    const config = db.prepare(`
      SELECT vc.*, u.email 
      FROM vpn_configs vc
      JOIN users u ON vc.userId = u.id
      WHERE vc.token = ? AND vc.active = 1
    `).get(token) as any;

    if (!config) {
      return new Response("Invalid or expired token", { status: 404 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (config.expiresAt < now) {
      return new Response("Subscription expired", { status: 403 });
    }

    // Log device activity
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    db.prepare(`INSERT OR IGNORE INTO token_devices (token, ip, lastSeen) VALUES (?, ?, ?)`).run(token, clientIp, now);
    db.prepare(`UPDATE token_devices SET lastSeen = ? WHERE token = ? AND ip = ?`).run(now, token, clientIp);

    // 1. Try to fetch the user from Marzban using the stored 'uuid'
    let mUser = await getMarzbanUser(config.uuid);

    // 2. Auto-migrate legacy users to Marzban
    if (!mUser && config.email) {
      const mUsername = sanitizeUsername(config.email);
      mUser = await getMarzbanUser(mUsername);
      if (!mUser) mUser = await createMarzbanUser(mUsername);

      if (mUser) {
        db.prepare(`UPDATE vpn_configs SET uuid = ? WHERE id = ?`).run(mUsername, config.id);
        console.log(`Auto-migrated user ${config.email} to Marzban username: ${mUsername}`);
      }
    }

    if (!mUser || mUser.status === 'disabled') {
       return new Response("User disabled or not found in Marzban", { status: 403 });
    }

    // Proxy the standard subscription content directly from Marzban
    if (mUser.subscription_url) {
      let internalSubUrl = mUser.subscription_url;
      
      if (internalSubUrl.startsWith('/')) {
        internalSubUrl = `http://127.0.0.1:8001${internalSubUrl}`;
      } else {
        try {
          const urlObj = new URL(internalSubUrl);
          internalSubUrl = `http://127.0.0.1:8001${urlObj.pathname}${urlObj.search}`;
        } catch (e) {
          console.error("Malformed subscription URL from Marzban:", mUser.subscription_url);
        }
      }

      const userAgent = req.headers.get('user-agent') || 'SpicyVPN Client';
      const subRes = await fetch(internalSubUrl, { headers: { 'User-Agent': userAgent } });
      
      if (subRes.ok) {
        const subData = await subRes.text();
        return new Response(subData, {
          headers: {
            "Content-Type": subRes.headers.get("Content-Type") || "text/plain; charset=utf-8",
            "Subscription-Userinfo": `upload=${mUser.used_traffic}; download=0; total=${mUser.data_limit}; expire=${mUser.expire}`,
            "Profile-Update-Interval": "1"
          }
        });
      }
    }

    return new Response("Failed to fetch upstream subscription", { status: 500 });

  } catch (error) {
    console.error("Sub route error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}