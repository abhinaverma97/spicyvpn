import { execSync } from "child_process";
import fs from "fs";

const XRAY_CONFIG = "/usr/local/etc/xray/config.json";

export function syncXrayClients() {
  try {
    const config = JSON.parse(fs.readFileSync(XRAY_CONFIG, "utf-8"));
    const db = require("better-sqlite3")("/home/ubuntu/.openclaw/workspace/spicyvpn/prisma/dev.db") as import("better-sqlite3").Database;
    const rows = db.prepare("SELECT uuid FROM vpn_configs WHERE active = 1").all() as { uuid: string }[];
    db.close();

    config.inbounds[0].settings.clients = rows.map((r) => ({
      id: r.uuid,
      flow: "xtls-rprx-vision",
    }));

    fs.writeFileSync(XRAY_CONFIG, JSON.stringify(config, null, 2));
    execSync("sudo systemctl reload xray || sudo systemctl restart xray");
  } catch (e) {
    console.error("Failed to sync Xray clients:", e);
  }
}
