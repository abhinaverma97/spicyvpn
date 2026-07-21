import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import os from "os";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abhinaverma97@gmail.com";

function getCpuPct(): number {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const line = stat.split('\n').find(l => l.startsWith('cpu '));
    if (!line) return 0;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + parts[4];
    const total = parts.reduce((a: number, b: number) => a + b, 0);

    const prev = (globalThis as any)._lastCpuStats;
    (globalThis as any)._lastCpuStats = { idle, total };

    if (!prev || total <= prev.total) return 0;
    const idleDiff = idle - prev.idle;
    const totalDiff = total - prev.total;
    if (totalDiff <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((1 - idleDiff / totalDiff) * 100)));
  } catch {
    return 0;
  }
}

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
  
  const now = Math.floor(Date.now() / 1000);
  
  const activeConfigsRow = db.prepare("SELECT COUNT(*) as count FROM vpn_configs WHERE active = 1 AND expiresAt > ?").get(now) as any;
  const activeConfigsCount = activeConfigsRow.count;

  // 2. Threshold for live check (last 60 seconds)
  const ACTIVE_THRESHOLD = now - 60; 

  const globalTraffic = db.prepare(`
    SELECT (SELECT COUNT(*) FROM vpn_configs WHERE lastActive >= ?) as live_count
  `).get(ACTIVE_THRESHOLD) as any;
  
  const monthlyRows = db.prepare("SELECT month, totalUp, totalDown FROM monthly_stats ORDER BY month DESC LIMIT 24").all() as any[];
  const currentMonth = monthlyRows[0] || { totalUp: 0, totalDown: 0 };
  const totalUp = currentMonth.totalUp || 0;
  const totalDown = currentMonth.totalDown || 0;
  const totalTraffic = totalUp + totalDown;
  const liveConnections = globalTraffic.live_count;

  const liveFromDb = db.prepare(`SELECT token FROM vpn_configs WHERE lastActive >= ?`).all(ACTIVE_THRESHOLD) as any[];
  const liveUsers = liveFromDb.map((row: any) => row.token);

  const past24h = now - 86400;
  const userCountLog = db.prepare("SELECT ts, count FROM user_count_log WHERE ts >= ? ORDER BY ts ASC").all(past24h) as any[];

  // System Stats
  const cpus = os.cpus();
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const diskStats = await getDiskUsage();

  return NextResponse.json({
    cpu: { 
      pct: getCpuPct(), 
      load: load[0].toFixed(2),
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
    userCountLog,
    monthlyBandwidth: monthlyRows.reverse(),
    vlessStatus: "active",
    totalUsers: totalUsersCount,
    activeUsers: activeConfigsCount,
    totalTrafficBytes: totalTraffic,
  });
}
