"use client";

import { useEffect, useState } from "react";
import { Shield, Users, Wifi, Clock, AlertCircle, Cpu, HardDrive, Activity, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import Footer from "./Footer";

type Stats = {
  totalUsers: number;
  activeConfigs: number;
  expiredConfigs: number;
  totalConfigs: number;
  capacity: number;
};

type User = {
  id: string;
  email: string;
  name: string;
  joinedAt: string;
  token: string | null;
  uuid: string | null;
  expiresAt: string | null;
  active: boolean;
  deviceCount: number;
};

type VpsStats = {
  cpu: { pct: number; load1: number; load5: number; load15: number; cores: number };
  ram: { used: number; total: number; pct: number };
  disk: { used: number; total: number; pct: number };
  uptime: string;
  network: { rx: number; tx: number };
  connections: number;
  liveUsers: string[];
  hysteriaStatus: string;
  userTraffic: Record<string, { up: number; down: number }>;
};

function fmt(bytes: number) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function StatBar({ pct, color = "bg-white" }: { pct: number; color?: string }) {
  return (
    <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminDashboard({ stats, users: initialUsers }: { stats: Stats; users: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [vps, setVps] = useState<VpsStats | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sortByLive, setSortByLive] = useState(false);

  async function deleteUser(id: string) {
    setDeleting(id);
    await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setUsers(u => u.filter(x => x.id !== id));
    setDeleting(null);
    setConfirmId(null);
  }

  useEffect(() => {
    async function fetchVps() {
      const res = await fetch("/api/admin/stats");
      if (res.ok) setVps(await res.json());
    }
    fetchVps();
    const interval = setInterval(fetchVps, 30000);
    return () => clearInterval(interval);
  }, []);

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const usedPct = Math.round((stats.totalUsers / stats.capacity) * 100);

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortByLive) return 0;
    const aLive = a.uuid && vps?.liveUsers?.includes(a.uuid) ? 1 : 0;
    const bLive = b.uuid && vps?.liveUsers?.includes(b.uuid) ? 1 : 0;
    return bLive - aLive;
  });

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <span className="font-semibold tracking-tight">SpicyVPN</span>
            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs ml-2">Admin</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/40 hover:text-white text-xs"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </Button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-xl font-bold mb-1">Overview</h1>
          <p className="text-white/30 text-sm">Real-time snapshot of all users and configs.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Total users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black">{stats.totalUsers}</p>
              <p className="text-xs text-white/30 mt-1">of {stats.capacity} capacity ({usedPct}%)</p>
              <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </CardContent>
          </Card>


          <Card className="bg-zinc-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" /> Active configs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-emerald-400">{stats.activeConfigs}</p>
              <p className="text-xs text-white/30 mt-1">currently connected</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Expired
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-white/40">{stats.expiredConfigs}</p>
              <p className="text-xs text-white/30 mt-1">need renewal</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Slots left
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-amber-400">{stats.capacity - stats.totalUsers}</p>
              <p className="text-xs text-white/30 mt-1">available</p>
            </CardContent>
          </Card>
        </div>

        {/* VPS Stats */}
        <div>
          <h2 className="text-sm font-medium text-white/40 mb-3 uppercase tracking-widest">Server</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> CPU
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black">{vps ? `${vps.cpu.pct}%` : "—"}</p>
                <p className="text-xs text-white/30 mt-1">{vps ? `Load ${vps.cpu.load1} · ${vps.cpu.cores} cores` : "loading..."}</p>
                {vps && <StatBar pct={vps.cpu.pct} color={vps.cpu.pct > 80 ? "bg-red-400" : "bg-white"} />}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> RAM
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black">{vps ? `${vps.ram.pct}%` : "—"}</p>
                <p className="text-xs text-white/30 mt-1">{vps ? `${fmt(vps.ram.used)} / ${fmt(vps.ram.total)}` : "loading..."}</p>
                {vps && <StatBar pct={vps.ram.pct} color={vps.ram.pct > 80 ? "bg-amber-400" : "bg-white"} />}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5" /> Disk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black">{vps ? `${vps.disk.pct}%` : "—"}</p>
                <p className="text-xs text-white/30 mt-1">{vps ? `${fmt(vps.disk.used)} / ${fmt(vps.disk.total)}` : "loading..."}</p>
                {vps && <StatBar pct={vps.disk.pct} />}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5" /> Live connections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black">{vps ? vps.connections : "—"}</p>
                <p className="text-xs text-white/30 mt-1">
                  {vps?.liveUsers?.length
                    ? `${vps.liveUsers.length} active user${vps.liveUsers.length > 1 ? 's' : ''}`
                    : "no active users"}
                </p>
              </CardContent>
            </Card>

          </div>

          {/* Network + uptime row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> Total received
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black">{vps ? fmt(vps.network.rx) : "—"}</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <ArrowUp className="w-3.5 h-3.5 text-blue-400" /> Total sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black">{vps ? fmt(vps.network.tx) : "—"}</p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-white/40 font-normal flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Uptime · Hysteria 2
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black">{vps ? vps.uptime : "—"}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {vps && (
                    <Badge className={vps.hysteriaStatus === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs"
                      : "bg-red-500/10 text-red-400 border-red-500/20 text-xs"}>
                      hysteria {vps.hysteriaStatus}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* User table */}
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">All Users ({users.length})</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-xs bg-white/5 border-white/10 hover:bg-white/10 text-white"
              onClick={() => setSortByLive(!sortByLive)}
            >
              {sortByLive ? "Clear sort" : "Sort by live connections"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-xs text-white/30">
                    <th className="text-left px-6 py-3 font-normal">User</th>
                    <th className="text-left px-6 py-3 font-normal">Joined</th>
                    <th className="text-left px-6 py-3 font-normal">Token</th>
                    <th className="text-left px-6 py-3 font-normal">Traffic Used</th>
                    <th className="text-left px-6 py-3 font-normal">Expires</th>
                    <th className="text-left px-6 py-3 font-normal">Status</th>
                    <th className="px-6 py-3 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {u.uuid && vps?.liveUsers?.includes(u.uuid) && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Connected now" />
                          )}
                          <p className="font-medium text-white/80">{u.name || "—"}</p>
                        </div>
                        <p className="text-xs text-white/30">{u.email}</p>
                      </td>
                      <td className="px-6 py-3 text-white/40 text-xs">
                        {new Date(u.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-6 py-3">
                        {u.token ? (
                          <code className="text-xs text-white/40 font-mono">{u.token}</code>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-mono text-white/60">
                            {vps?.userTraffic && u.uuid && vps.userTraffic[u.uuid as string]
                              ? fmt((vps.userTraffic[u.uuid as string].up || 0) + (vps.userTraffic[u.uuid as string].down || 0))
                              : "0 KB"}
                          </span>
                          <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500/50 rounded-full" 
                              style={{ 
                                width: `${Math.min(100, (vps?.userTraffic && u.uuid && vps.userTraffic[u.uuid as string] 
                                  ? (((vps.userTraffic[u.uuid as string].up || 0) + (vps.userTraffic[u.uuid as string].down || 0)) / (35 * 1024 * 1024 * 1024)) * 100 
                                  : 0))}%` 
                              }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-xs text-white/40">
                        {u.expiresAt ? (
                          <span className={daysLeft(u.expiresAt) <= 3 ? "text-red-400" : ""}>
                            {daysLeft(u.expiresAt)}d left
                          </span>
                        ) : "—"}
                      </td>
                      
                      <td className="px-6 py-3">
                        {u.active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Active</Badge>
                        ) : (
                          <Badge className="bg-white/5 text-white/30 border-white/10 text-xs">No config</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {confirmId === u.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-white/40">Sure?</span>
                            <button
                              onClick={() => deleteUser(u.id)}
                              disabled={deleting === u.id}
                              className="text-xs text-red-400 hover:text-red-300 font-medium"
                            >
                              {deleting === u.id ? "..." : "Yes"}
                            </button>
                            <button onClick={() => setConfirmId(null)} className="text-xs text-white/30 hover:text-white">
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(u.id)}
                            className="text-white/20 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
