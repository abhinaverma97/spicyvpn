const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Configuration
const HUB_URL = process.env.HUB_URL || "https://spicypepper.app";
const API_KEY = process.env.NODE_API_KEY;
const HYSTERIA_API_URL = process.env.HYSTERIA_API_URL || "http://127.0.0.1:8080";
const INTERVAL_MS = 30000; // 30 seconds

if (!API_KEY) {
  console.error("FATAL: NODE_API_KEY not found in environment.");
  process.exit(1);
}

console.log(`Starting SpicyVPN Traffic Agent for Node Sync.`);
console.log(`Hub: ${HUB_URL}`);

async function poll() {
  try {
    // 1. Get traffic from local Hysteria 2 instance
    const res = await axios.get(`${HYSTERIA_API_URL}/traffic`, { timeout: 5000 });
    const currentTraffic = res.data || {};

    // 2. Sync with Hub
    const syncRes = await axios.post(`${HUB_URL}/api/node/sync`, {
      apiKey: API_KEY,
      traffic: currentTraffic
    }, { timeout: 10000 });

    if (syncRes.data.ok) {
      const { kick_users } = syncRes.data;
      
      // 3. Kick users if instructed by Hub
      if (kick_users && kick_users.length > 0) {
        try {
          await axios.post(`${HYSTERIA_API_URL}/kick`, kick_users, { timeout: 5000 });
          console.log(`[${new Date().toISOString()}] Kicked users: ${kick_users.join(', ')}`);
        } catch (kickErr) {
          console.error("Failed to kick users:", kickErr.message);
        }
      }
      console.log(`[${new Date().toISOString()}] Synced ${Object.keys(currentTraffic).length} users.`);
    } else {
      console.error("Sync failed:", syncRes.data.error);
    }

  } catch (error) {
    console.error("Traffic Agent Error:", error.message);
  }
}

// Initial poll
poll();
// Set interval
setInterval(poll, INTERVAL_MS);
