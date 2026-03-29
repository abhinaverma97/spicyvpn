import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

function getUptime() {
  const seconds = os.uptime();
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

async function getDiskUsage() {
  try {
    const { stdout } = await execAsync("df / --output=size,used,pcent | tail -1");
    const out = stdout.trim().split(/\s+/);
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
  const countRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
  const totalUsersCount = countRow.count;
  
  const activeConfigs = db.prepare("SELECT COUNT(*) as count FROM vpn_configs WHERE active = 1").get() as any;

  // 2. Threshold for live check
  const now = Math.floor(Date.now() / 1000);
  // Active in the last 5 minutes
  const ACTIVE_THRESHOLD = now - 300; 

  const globalTraffic = db.prepare(`
    SELECT SUM(totalUp) as up, SUM(totalDown) as down,
    (SELECT COUNT(*) FROM vpn_configs WHERE lastActive >= ?) as live_count
    FROM vpn_configs
  `).get(ACTIVE_THRESHOLD) as any;
  
  const totalUp = globalTraffic.up || 0;
  const totalDown = globalTraffic.down || 0;
  const totalTraffic = totalUp + totalDown;
  const liveConnections = globalTraffic.live_count;

  const liveFromDb = db.prepare(`SELECT uuid FROM vpn_configs WHERE lastActive >= ?`).all(ACTIVE_THRESHOLD) as any[];
  const liveUsers = liveFromDb.map((row: any) => row.uuid);

  // System Stats
  const cpus = os.cpus();
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const diskStats = await getDiskUsage();

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
    disk: diskStats,
    uptime: getUptime(),
    network: { rx: totalDown, tx: totalUp }, 
    connections: liveConnections,
    liveUsers: liveUsers, 
    hysteriaStatus: "active",
    totalUsers: totalUsersCount,
    activeUsers: activeConfigs.count,
    totalTrafficBytes: totalTraffic,
  });
}
