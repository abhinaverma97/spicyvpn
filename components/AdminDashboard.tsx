"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  Cpu, 
  HardDrive, 
  Activity, 
  Trash2, 
  Search,
  RefreshCw,
  Database,
  ChevronDown,
  LogOut,
  ArrowUpRight,
  MoreHorizontal
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  lastActive: number | null;
  usedTraffic: number;
  dataLimit: number;
  marzbanStatus: string;
};

type VpsStats = {
  cpu: { pct: number; load1: string; cores: number };
  ram: { used: number; total: number; pct: number };
  disk: { used: number; total: number; pct: number };
  uptime: string;
  network: { rx: number; tx: number };
  connections: number;
  liveUsers: string[];
  userTraffic: Record<string, { up: number; down: number }>;
  totalUsers: number;
  activeUsers: number;
  totalTrafficBytes: number;
};

function fmt(bytes: number) {
  if (bytes === -1) return "Unlimited";
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

export default function AdminDashboard({ stats: initialStats, users: initialUsers }: { stats: Stats; users: User[] }) {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [vps, setVps] = useState<VpsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState('overview');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function refreshData() {
    setLoading(true);
    try {
      const [vpsRes, usersRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin")
      ]);

      if (vpsRes.ok) setVps(await vpsRes.json());
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.map((u: any) => ({
          ...u,
          joinedAt: u.createdAt ? new Date(u.createdAt * 1000).toISOString() : new Date().toISOString(),
          active: Boolean(u.active),
          expiresAt: u.expiresAt ? new Date(u.expiresAt * 1000).toISOString() : null,
          lastActive: Number(u.lastActive || 0),
        })));
      }
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    refreshData();
    const interval = setInterval(refreshData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function deleteUser(id: string) {
    setDeleting(id);
    await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setUsers(u => u.filter(x => x.id !== id));
    setDeleting(null);
    setConfirmId(null);
  }

  function daysLeft(expiresAt: any) {
    if (!expiresAt) return 0;
    const expiry = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime();
    const diff = expiry - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  if (!mounted) return null;

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.uuid?.toLowerCase().includes(search.toLowerCase())
  );

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aLive = vps?.liveUsers?.includes(a.uuid as string) ? 1 : 0;
    const bLive = vps?.liveUsers?.includes(b.uuid as string) ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return b.usedTraffic - a.usedTraffic;
  });

  const liveCount = vps?.liveUsers?.length || 0;
  const connectionCount = vps?.connections || 0;

  return (
    <div className="min-h-screen bg-[#000] text-[#fafafa] font-sans antialiased">
      {/* Sidebar-style Nav */}
      <div className="flex flex-col md:flex-row min-h-screen">
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 bg-[#09090b] flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
              <div className="w-3 h-3 bg-black rounded-sm" />
            </div>
            <span className="font-bold text-sm tracking-tight uppercase">Admin Console</span>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            <button 
              onClick={() => window.location.href = "/dashboard"}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors mb-4 border border-zinc-800/50"
            >
              <ArrowUpRight className="w-4 h-4" />
              User Dashboard
            </button>
            <div className="h-px bg-zinc-800 my-4 mx-2" />
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'overview' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
            >
              <Activity className="w-4 h-4" />
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'users' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
            >
              <Users className="w-4 h-4" />
              User Registry
            </button>
          </nav>

          <div className="p-4 mt-auto border-t border-zinc-800">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="w-8 h-8 border border-zinc-700">
                <AvatarFallback className="bg-zinc-900 text-xs">AD</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate text-zinc-200">Spicy Admin</p>
                <p className="text-[10px] text-zinc-500 truncate">v0.8.4 Stable</p>
              </div>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="text-zinc-500 hover:text-red-400">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-10 max-w-6xl mx-auto w-full">
          <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{activeTab === 'overview' ? 'System Health' : 'User Management'}</h1>
              <p className="text-zinc-500 text-sm mt-1">{vps?.uptime || 'Updating telemetry...'}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-zinc-700'}`} />
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{liveCount} Live Users</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshData}
                className="bg-transparent border-zinc-800 hover:bg-zinc-900 text-zinc-400"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </header>

          {activeTab === 'overview' && (
            <div className="space-y-10 animate-in fade-in duration-500">
              {/* Primary Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'CPU Load', value: `${vps?.cpu.pct || 0}%`, icon: Cpu, sub: `${vps?.cpu.cores} Cores` },
                  { label: 'Memory', value: `${vps?.ram.pct || 0}%`, icon: Activity, sub: `${Math.round((vps?.ram.used || 0) / 1024 / 1024)} MB Used` },
                  { label: 'Storage', value: `${vps?.disk.pct || 0}%`, icon: HardDrive, sub: 'Root Partition' },
                  { label: 'Connections', value: connectionCount, icon: Database, sub: 'Active Tunnels' },
                ].map((stat, i) => (
                  <div key={i} className="bg-[#09090b] border border-zinc-800 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <stat.icon className="w-4 h-4 text-zinc-500" />
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                    <div className="text-[11px] text-zinc-500 font-medium">{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Data and Leaderboard */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Heaviest Consumers</h2>
                    <ArrowUpRight className="w-4 h-4 text-zinc-600" />
                  </div>
                  <div className="bg-[#09090b] border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                    {users.sort((a, b) => b.usedTraffic - a.usedTraffic).slice(0, 6).map((u, i) => {
                      const isLive = vps?.liveUsers?.includes(u.uuid as string);
                      return (
                        <div key={i} className="flex items-center justify-between p-4 group hover:bg-zinc-900/50 transition-colors">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-400">
                              {u.name[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-zinc-200 truncate">{u.name}</p>
                                {isLive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                              </div>
                              <p className="text-[11px] text-zinc-500 truncate font-mono">{u.email}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-white">{fmt(u.usedTraffic)}</p>
                            <div className="w-20 h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-zinc-400" style={{ width: `${u.dataLimit > 0 ? (u.usedTraffic / u.dataLimit) * 100 : 0}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 px-2">Traffic Totals</h2>
                    <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-lg space-y-6">
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-zinc-500">Cumulative Throughput</span>
                          <span className="text-zinc-300 font-bold">{fmt(vps?.totalTrafficBytes || 0)}</span>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500/50" style={{ width: '65%' }} />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-black">Registered</p>
                          <p className="text-lg font-bold text-white">{users.length}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase font-black">Active</p>
                          <p className="text-lg font-bold text-emerald-400">{vps?.activeUsers || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text"
                  placeholder="Filter database by name or identifier..."
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-lg pl-11 pr-4 py-3 text-sm text-zinc-200 focus:border-zinc-600 outline-none transition-all placeholder:text-zinc-700"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="bg-[#09090b] border border-zinc-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#111113] border-b border-zinc-800">
                      <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                        <th className="px-6 py-4 font-black">Identity</th>
                        <th className="px-6 py-4 text-center font-black">Status</th>
                        <th className="px-6 py-4 font-black">Volume</th>
                        <th className="px-6 py-4 text-right font-black">Expiration</th>
                        <th className="px-6 py-4 text-right pr-8 font-black">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {sortedUsers.map((u, i) => {
                        const isLive = vps?.liveUsers?.includes(u.uuid as string);
                        const usagePct = u.dataLimit > 0 ? (u.usedTraffic / u.dataLimit) * 100 : 0;
                        return (
                          <tr key={i} className="group hover:bg-zinc-900/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded border flex items-center justify-center text-xs font-bold ${isLive ? 'bg-white border-white text-black' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                                  {u.name[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-zinc-200 truncate">{u.name}</p>
                                  <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isLive ? (
                                <Badge className="bg-emerald-500 text-black border-none text-[9px] font-black uppercase rounded-sm px-2">Live Now</Badge>
                              ) : (
                                <Badge variant="outline" className="text-zinc-600 border-zinc-800 text-[9px] font-bold uppercase rounded-sm">Offline</Badge>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="w-32 space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                                  <span>{fmt(u.usedTraffic)}</span>
                                  <span>{u.dataLimit > 0 ? fmt(u.dataLimit).split(' ')[0] : 'Unlimited'}</span>
                                </div>
                                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${usagePct > 80 ? 'bg-red-500' : 'bg-zinc-400'}`} style={{ width: `${Math.min(100, usagePct)}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <p className={`text-xs font-bold ${daysLeft(u.expiresAt) < 3 ? 'text-red-400' : 'text-zinc-400'}`}>
                                {u.expiresAt ? `${daysLeft(u.expiresAt)} Days` : 'Lifetime'}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right pr-8">
                              <div className="flex items-center justify-end gap-2">
                                {confirmId === u.id ? (
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => deleteUser(u.id)} className="text-[10px] font-black text-red-400 uppercase">Confirm</button>
                                    <button onClick={() => setConfirmId(null)} className="text-[10px] font-black text-zinc-600 uppercase">Esc</button>
                                  </div>
                                ) : (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="p-1 text-zinc-600 hover:text-white transition-colors">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-white">
                                      <DropdownMenuItem onClick={() => setConfirmId(u.id)} className="text-red-400 focus:text-red-400 cursor-pointer">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete User
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
