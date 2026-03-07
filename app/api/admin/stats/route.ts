import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import os from "os";
import { execSync } from "child_process";

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

function getUptime() {
  const seconds = os.uptime();
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function getDiskUsage() {
  try {
    const out = execSync("df / --output=size,used,pcent | tail -1").toString().trim().split(/\s+/);
    return {
      total: parseInt(out[0]) * 1024,
      used: parseInt(out[1]) * 1024,
      pct: parseInt(out[2].replace('%', ''))
    };
  } catch {
    return { total: 0, used: 0, pct: 0 };
  }
}

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  
  // 1. Basic Local Stats
  const totalConfigs = db.prepare("SELECT COUNT(*) as count FROM vpn_configs").get() as any;
  const activeConfigs = db.prepare("SELECT COUNT(*) as count FROM vpn_configs WHERE active = 1").get() as any;

  // 2. Fetch User Stats and Live Connections from DB
  const now = Math.floor(Date.now() / 1000);
  // Consider users active if they transferred data in the last 60 seconds
  const ACTIVE_THRESHOLD = now - 60; 

  const configs = db.prepare("SELECT uuid, totalUp, totalDown, lastActive FROM vpn_configs").all() as any[];

  let totalTraffic = 0;
  let totalUp = 0;
  let totalDown = 0;
  let liveConnections = 0;
  const userTraffic: Record<string, { up: number; down: number; lastActive: number }> = {};
  const liveUsers: string[] = [];

  for (const config of configs) {
    const up = config.totalUp || 0;
    const down = config.totalDown || 0;
    totalTraffic += (up + down);
    totalUp += up;
    totalDown += down;
    
    userTraffic[config.uuid] = { up, down, lastActive: config.lastActive };
    
    if (config.lastActive >= ACTIVE_THRESHOLD) {
      liveConnections++;
      liveUsers.push(config.uuid);
    }
  }

  // 3. System Stats
  const cpus = os.cpus();
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return NextResponse.json({
    cpu: { 
      pct: Math.round(load[0] * 100 / cpus.length), 
      load1: load[0].toFixed(2),
      cores: cpus.length 
    },
    ram: { 
      used: usedMem, 
      total: totalMem, 
      pct: Math.round((usedMem / totalMem) * 100) 
    },
    disk: getDiskUsage(),
    uptime: getUptime(),
    network: { rx: totalDown, tx: totalUp }, 
    connections: liveConnections,
    liveUsers: liveUsers, 
    hysteriaStatus: "active",
    userTraffic,
    totalUsers: totalConfigs.count,
    activeUsers: activeConfigs.count,
    totalTrafficBytes: totalTraffic,
  });
}
