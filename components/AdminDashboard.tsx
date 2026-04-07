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
  ChevronDown,
  LogOut,
  ArrowUpRight,
  Wifi,
  Shield,
  Check,
  Smartphone,
  Monitor,
  Clock
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
import GlassCard from "./GlassCard";
import dynamic from "next/dynamic";

const Dither = dynamic(() => import("./Dither"), { ssr: false });

type User = {
  id: string;
  email: string;
  name: string;
  joinedAt: string;
  token: string | null;
  uuid: string | null;
  expiresAt: string | null;
  active: boolean;
  usedTraffic: number;
  dataLimit: number;
};

type VpsStats = {
  cpu: { pct: number; load1: string; cores: number };
  ram: { used: number; total: number; pct: number };
  disk: { used: number; total: number; pct: number };
  uptime: string;
  network: { rx: number; tx: number };
  connections: number;
  liveUsers: string[];
  totalUsers: number;
  activeUsers: number;
  totalTrafficBytes: number;
};

function fmt(bytes: number) {
  if (bytes === -1 || bytes === undefined) return "0.0 KB";
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

export default function AdminDashboard({ users: initialUsers }: { users: User[] }) {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [vps, setVps] = useState<VpsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "live" | "new" | "active">("all");
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
        setUsers(data);
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
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function deleteUser(id: string) {
    await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setUsers(u => u.filter(x => x.id !== id));
    setConfirmId(null);
  }

  function daysLeft(expiresAt: any) {
    if (!expiresAt) return -1;
    // If it's a number, assume it's Unix seconds and convert to ms
    const expiryMs = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime();
    const diff = expiryMs - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  if (!mounted) return null;

  const searchedUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.uuid?.toLowerCase().includes(search.toLowerCase())
  );

  const liveUsersCount = users.filter(u => vps?.liveUsers?.includes(u.uuid as string)).length;
  const activeSubsCount = users.filter(u => u.active && u.expiresAt && (typeof u.expiresAt === 'number' ? u.expiresAt * 1000 : new Date(u.expiresAt).getTime()) > Date.now()).length;

  const filteredUsers = searchedUsers.filter(u => {
    if (filterType === "live") return vps?.liveUsers?.includes(u.uuid as string);
    if (filterType === "active") return u.active && u.expiresAt && (typeof u.expiresAt === 'number' ? u.expiresAt * 1000 : new Date(u.expiresAt).getTime()) > Date.now();
    return true; // 'new' and 'all' show everyone
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    // If 'new' is selected, override default sorting to sort by join date
    if (filterType === "new") {
      return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
    }
    
    // Default sorting: Live first, then by highest data usage
    const aLive = vps?.liveUsers?.includes(a.uuid as string) ? 1 : 0;
    const bLive = vps?.liveUsers?.includes(b.uuid as string) ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return b.usedTraffic - a.usedTraffic;
  });

  const liveCount = vps?.connections || 0;

  return (
    <div className="relative min-h-screen bg-black text-white overflow-x-hidden no-scrollbar">
      {/* Background Dither */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40 hidden sm:block">
        <Dither />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav */}
        <nav className="border-b border-white/10 px-6 py-4 backdrop-blur-md bg-black/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                <span className="font-semibold tracking-tight uppercase">SpicyVPN</span>
              </a>
              <div className="hidden md:flex items-center gap-4 border-l border-white/10 pl-6">
                <button 
                  onClick={() => window.location.href = "/dashboard"}
                  className="flex items-center gap-2 text-xs font-medium text-white/40 hover:text-white transition-colors uppercase tracking-widest"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> User View
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={refreshData}
                className="bg-white/5 border border-white/5 hover:bg-white/10 text-white/70 h-8 text-[10px] font-bold uppercase tracking-widest"
              >
                <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white/70 hover:text-white h-8">
                    <Avatar className="w-6 h-6 border border-white/10">
                      <AvatarFallback className="bg-white/5 text-[10px]">AD</AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-3 h-3 text-white/30" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white min-w-[150px]">
                  <DropdownMenuItem onClick={() => window.location.href = "/dashboard"} className="md:hidden cursor-pointer text-xs uppercase font-bold">
                    User Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-red-400 focus:text-red-400 cursor-pointer text-xs uppercase font-bold">
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 w-full space-y-10">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black mb-2 tracking-tight uppercase">Admin Console</h1>
              <p className="text-white/40 text-lg uppercase tracking-widest text-xs font-bold">Full Fleet Management & Node Telemetry</p>
            </div>
            
            {/* Engine Stats */}
            <div className="flex gap-10">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Engine Load</span>
                <div className="text-xl font-bold text-white/80">{vps?.cpu.pct || 0}% <span className="text-[10px] text-white/20">CPU</span></div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Memory</span>
                <div className="text-xl font-bold text-white/80">{vps?.ram.pct || 0}% <span className="text-[10px] text-white/20">RAM</span></div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Online</span>
                <div className="flex items-center gap-2">
                  <div className="text-xl font-bold text-emerald-400">{liveCount}</div>
                  <div className={`w-1.5 h-1.5 rounded-full ${liveCount > 0 ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-zinc-700'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <GlassCard className="p-6 border-white/5" intensity={0.05}>
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Total Registry</span>
              <div className="text-3xl font-black text-white">{vps?.totalUsers || 0}</div>
            </GlassCard>
            <GlassCard className="p-6 border-white/5" intensity={0.05}>
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Active Subs</span>
              <div className="text-3xl font-black text-blue-400">{vps?.activeUsers || 0}</div>
            </GlassCard>
            <GlassCard className="p-6 border-white/5" intensity={0.05}>
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Uptime</span>
              <div className="text-3xl font-black text-white/80 uppercase tracking-tighter">{vps?.uptime.split(' ')[0]} <span className="text-xs text-white/20">Days</span></div>
            </GlassCard>
            <GlassCard className="p-6 border-white/5" intensity={0.05}>
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Network Total (Month)</span>
              <div className="text-3xl font-black text-emerald-400 truncate">{fmt(vps?.totalTrafficBytes || 0)}</div>
            </GlassCard>
          </div>

          {/* User List */}
          <GlassCard className="overflow-hidden border-white/5" intensity={0.08}>
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-white/30" /> Identity Registry
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <select 
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                  className="bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white/70 focus:border-white/20 outline-none transition-all cursor-pointer min-w-[160px]"
                >
                  <option value="all">All ({searchedUsers.length})</option>
                  <option value="live">Live Now ({liveUsersCount})</option>
                  <option value="active">Active Subs ({activeSubsCount})</option>
                  <option value="new">Sort by Newest</option>
                </select>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input 
                    type="text"
                    placeholder="Filter users..."
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white/70 focus:border-white/20 outline-none transition-all placeholder:text-white/10"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-white/5 border-b border-white/5">
                  <tr className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                    <th className="px-6 py-3">Identity</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3">Data Consumed</th>
                    <th className="px-6 py-3 text-right">Validity</th>
                    <th className="px-6 py-3 text-right pr-6">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedUsers.map((u, i) => {
                    const isLive = vps?.liveUsers?.includes(u.uuid as string);
                    const limit = 35 * 1024 * 1024 * 1024;
                    const usagePct = (u.usedTraffic / limit) * 100;
                    
                    return (
                      <tr key={i} className={`group transition-all duration-300 ${isLive ? 'bg-emerald-500/[0.02]' : 'hover:bg-white/[0.02]'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-sm shrink-0 transition-all duration-500 ${isLive ? 'bg-white border-white text-black scale-105 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'bg-white/5 border-white/5 text-white/30'}`}>
                              {u.name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white/90 truncate">{u.name}</p>
                              <p className="text-[10px] text-white/30 truncate font-mono">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isLive ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                              Live Now
                            </Badge>
                          ) : (
                            <Badge className="bg-transparent text-white/20 border-white/5 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                              Offline
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-40 space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className={isLive ? "text-emerald-400" : "text-white/40"}>{fmt(u.usedTraffic)}</span>
                              <span className="text-white/10 uppercase tracking-tighter italic">Cap 35 GB</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                              <div 
                                className={`h-full transition-all duration-1000 ${usagePct > 90 ? 'bg-red-500' : isLive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-white/20'}`} 
                                style={{ width: `${Math.min(100, usagePct)}%` }} 
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex flex-col items-end">
                            <p className={`text-xs font-bold ${daysLeft(u.expiresAt) !== -1 && daysLeft(u.expiresAt) < 3 ? 'text-red-400' : 'text-white/70'}`}>
                              {daysLeft(u.expiresAt) === -1 ? 'NO PLAN' : `${daysLeft(u.expiresAt)} DAYS`}
                            </p>
                            <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-0.5">Remaining</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right pr-6">
                          <div className="flex items-center justify-end">
                            {confirmId === u.id ? (
                              <div className="flex items-center gap-2 animate-in zoom-in-95">
                                <button onClick={() => deleteUser(u.id)} className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-lg border border-red-400/20 hover:bg-red-400/20 transition-all uppercase tracking-widest">Revoke</button>
                                <button onClick={() => setConfirmId(null)} className="text-[9px] font-bold text-white/30 uppercase px-2">Esc</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmId(u.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {sortedUsers.length === 0 && (
              <div className="p-24 text-center flex flex-col items-center gap-4 opacity-30">
                <Shield className="w-12 h-12 mb-2" />
                <p className="text-sm font-bold uppercase tracking-widest">Registry Search Empty</p>
              </div>
            )}
          </GlassCard>
        </main>
        
        <Footer />
      </div>
    </div>
  );
}
