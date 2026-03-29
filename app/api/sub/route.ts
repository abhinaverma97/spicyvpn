import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const db = getDb();
    
    const config = db.prepare(`
      SELECT vc.*, u.email, u.name 
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

    // Return the Hysteria 2 connection link directly as the subscription content
    // We base64 encode it as that is standard for subscription lists
    const userName = config.name ? config.name.split(" ")[0] : "User";
    const hy2Link = `hy2://${config.token}@140.245.13.64:443?insecure=1&sni=www.microsoft.com#SpicyVPN-${userName}`;
    const base64Data = Buffer.from(hy2Link).toString('base64');

    return new Response(base64Data, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Subscription-Userinfo": `upload=${config.totalUp}; download=${config.totalDown}; total=${config.dataLimit}; expire=${config.expiresAt}`,
        "Profile-Update-Interval": "1"
      }
    });

  } catch (error) {
    console.error("Sub route error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
