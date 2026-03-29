import { getDb } from "./lib/db.js";
import fetch from "node-fetch";

const STATS_URL = "http://127.0.0.1:9999/traffic"; // Correct Hysteria 2 traffic endpoint

async function updateTraffic() {
  try {
    const res = await fetch(STATS_URL);
    if (!res.ok) return;

    const stats = await res.json();

    // Hysteria 2 /traffic endpoint returns a map of { "username": { "tx": 123, "rx": 456 } }
    if (stats) {
      for (const [password, traffic] of Object.entries(stats)) {
        const up = traffic.tx || 0;
        const down = traffic.rx || 0;
        
        if (password) {
          db.prepare(`
            UPDATE vpn_configs 
            SET totalUp = totalUp + ?, 
                totalDown = totalDown + ?,
                lastActive = unixepoch()
            WHERE token = ?
          `).run(up, down, password);
        }
      }
    }
  } catch (error) {
    // Silently ignore or log periodically
  }
}

// Run every 10 seconds
setInterval(updateTraffic, 10000);
console.log("Spicy Traffic Tracker started...");
