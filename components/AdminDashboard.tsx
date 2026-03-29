"use client";

import { useEffect, useState } from "react";
import { 
  Shield, 
  Users, 
  Wifi, 
  Clock, 
  AlertCircle, 
  Cpu, 
  HardDrive, 
  Activity, 
  ArrowUp, 
  Trash2, 
  Search,
  RefreshCw,
  Circle,
  Database,
  Check,
  Zap,
  ChevronDown,
  LogOut
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

function StatBar({ pct, color = "bg-white" }: { pct: number; color?: string }) {
  return (
    <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
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
    const interval = setInterval(refreshData, 30000);
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

  const now = Math.floor(Date.now() / 1000);
  const liveCount = vps?.liveUsers?.length || 0;
  const connectionCount = vps?.connections || 0;

  return (
    <div className="relative min-h-screen bg-black text-white overflow-x-hidden no-scrollbar font-sans">
      {/* Background Dither */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40 hidden sm:block">
        <Dither />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav */}
        <nav className="border-b border-white/10 px-6 py-4 backdrop-blur-md bg-black/20">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight">SpicyVPN</span>
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-black uppercase px-2 py-0.5 ml-2">Core Admin</Badge>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white/70 hover:text-white">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-[10px] bg-white/10">AD</AvatarFallback>
                  </Avatar>
                  <span className="text-base hidden sm:block">Administrator</span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white">
                <DropdownMenuItem
                  className="hover:bg-white/10 cursor-pointer"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>

        {/* Main */}
        <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 w-full flex-1">
          
          <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">System Overview</h1>
              <p className="text-white/40 text-lg">
                Real-time monitoring of SpicyVPN infrastructure.
              </p>
            </div>
            <div className="flex bg-white/5 p-1 rounded-xl w-fit shrink-0 backdrop-blur-md border border-white/5">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Health
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Registry
              </button>
            </div>
          </div>

          {/* Live Status Row */}
          <GlassCard className="p-8 mb-8 flex flex-col sm:flex-row items-center justify-between gap-8 border-white/5" intensity={0.08}>
            <div className="flex items-center gap-6 text-center sm:text-left flex-col sm:flex-row">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-xl backdrop-blur-md">
                <Zap className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold tracking-tight text-white/90">Network Status: <span className="text-emerald-400">Operational</span></h3>
                <p className="text-base text-white/40 leading-relaxed">
                  Engine is currently processing {vps?.connections || 0} active tunnels across the registry.
                </p>
              </div>
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <div className="flex-1 sm:flex-none bg-black/40 border border-white/5 px-6 py-3 rounded-2xl flex flex-col items-center sm:items-start min-w-[120px]">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Live Users</span>
                <span className="text-3xl font-black text-emerald-400">{liveCount}</span>
              </div>
              <div className="flex-1 sm:flex-none bg-black/40 border border-white/5 px-6 py-3 rounded-2xl flex flex-col items-center sm:items-start min-w-[120px]">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Live Conn</span>
                <span className="text-3xl font-black text-blue-400">{connectionCount}</span>
              </div>
            </div>
          </GlassCard>

          {activeTab === 'overview' && (
            <div className="grid gap-8 animate-in fade-in duration-500">
              
              {/* Hardware Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <GlassCard className="p-6 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                  <div className="text-4xl font-black tracking-tighter text-white/90 leading-none">{vps?.cpu.pct || 0}%</div>
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">CPU Load</div>
                  <StatBar pct={vps?.cpu.pct || 0} color="bg-blue-500" />
                </GlassCard>

                <GlassCard className="p-6 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                  <div className="text-4xl font-black tracking-tighter text-white/90 leading-none">{vps?.ram.pct || 0}%</div>
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Memory</div>
                  <StatBar pct={vps?.ram.pct || 0} color="bg-purple-500" />
                </GlassCard>

                <GlassCard className="p-6 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                  <div className="text-4xl font-black tracking-tighter text-white/90 leading-none">{vps?.disk.pct || 0}%</div>
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Storage</div>
                  <StatBar pct={vps?.disk.pct || 0} color="bg-amber-500" />
                </GlassCard>

                <GlassCard className="p-6 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                  <div className="text-2xl font-black tracking-tighter text-white/90 leading-none truncate w-full">{vps ? fmt(vps.totalTrafficBytes).split(' ')[0] : "0"} <span className="text-lg text-white/30">{vps ? fmt(vps.totalTrafficBytes).split(' ')[1] : "GB"}</span></div>
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Total TX</div>
                  <div className="mt-2 text-[8px] text-emerald-500/50 font-black uppercase">Data Tunneled</div>
                </GlassCard>
              </div>

              {/* Main Analytics Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <GlassCard className="p-0 border-white/5 overflow-hidden" intensity={0.08}>
                    <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <h3 className="text-lg font-black tracking-tight text-white/90">Top Data Consumers</h3>
                      <Users className="w-5 h-5 text-white/20" />
                    </div>
                    <div className="divide-y divide-white/5">
                      {users.sort((a, b) => b.usedTraffic - a.usedTraffic).slice(0, 5).map((u, i) => {
                        const isLive = vps?.liveUsers?.includes(u.uuid as string);
                        return (
                          <div key={i} className="px-8 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center font-black text-emerald-500">
                                  {u.name[0].toUpperCase()}
                                </div>
                                {isLive && <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />}
                              </div>
                              <div>
                                <p className="font-bold text-white/90">{u.name}</p>
                                <p className="text-xs text-white/30 truncate max-w-[150px] sm:max-w-none">{u.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-mono font-black text-emerald-400">{fmt(u.usedTraffic)}</p>
                              <div className="w-32 h-1 bg-white/5 rounded-full mt-2">
                                <div className="h-full bg-emerald-500/50 rounded-full" style={{ width: `${u.dataLimit > 0 ? (u.usedTraffic / u.dataLimit) * 100 : 0}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </GlassCard>
                </div>

                <div className="space-y-8">
                  <GlassCard className="p-8 border-white/5" intensity={0.05}>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/30 mb-8 flex items-center gap-2">
                      <Database className="w-4 h-4" /> Statistics
                    </h3>
                    <div className="space-y-6">
                      <div className="flex justify-between items-center p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-white/40 uppercase">Registered</span>
                        <span className="text-xl font-black text-white/90">{users.length}</span>
                      </div>
                      <div className="flex justify-between items-center p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-white/40 uppercase">Active</span>
                        <span className="text-xl font-black text-emerald-400">{vps?.activeUsers || 0}</span>
                      </div>
                      <div className="flex justify-between items-center p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                        <span className="text-xs font-bold text-white/40 uppercase">Slots Left</span>
                        <span className="text-xl font-black text-amber-400">{Math.max(0, 500 - users.length)}</span>
                      </div>
                    </div>
                    <div className="mt-10 pt-8 border-t border-white/5 text-center">
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4">Uptime</p>
                      <div className="text-4xl font-black text-white/40 tracking-tighter italic">{vps?.uptime.split(' ').slice(0,2).join(' ') || "0d 0h"}</div>
                    </div>
                  </GlassCard>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-emerald-500 transition-colors" />
                <input 
                  type="text"
                  placeholder="Search user database..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 pr-6 py-5 text-lg font-medium focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10 shadow-2xl backdrop-blur-xl"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="grid gap-6">
                {filteredUsers.map((u, i) => {
                  const isLive = vps?.liveUsers?.includes(u.uuid as string);
                  const usagePct = u.dataLimit > 0 ? (u.usedTraffic / u.dataLimit) * 100 : 0;
                  return (
                    <GlassCard key={i} className="p-6 border-white/5" intensity={0.05}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center font-black text-2xl text-emerald-500 shadow-2xl">
                              {u.name[0].toUpperCase()}
                            </div>
                            {isLive && <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-4 border-black animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.6)]" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-xl text-white/90">{u.name}</h3>
                              {isLive && <Badge className="bg-emerald-500/10 text-emerald-400 border-none text-[9px] h-5 px-2 font-black uppercase tracking-widest">Live Now</Badge>}
                            </div>
                            <p className="text-white/30 font-medium">{u.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-8">
                          <div className="hidden md:block w-48 space-y-2">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
                              <span>Usage</span>
                              <span>{usagePct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className={`h-full ${usagePct > 80 ? 'bg-red-500' : 'bg-emerald-500'} rounded-full transition-all duration-1000`} style={{ width: `${Math.min(100, usagePct)}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-white/20">
                              <span>{fmt(u.usedTraffic)}</span>
                              <span>{u.dataLimit > 0 ? fmt(u.dataLimit) : 'Unlimited'}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end">
                            <p className={`text-sm font-black ${daysLeft(u.expiresAt) < 3 ? 'text-red-400' : 'text-white/60'}`}>
                              {u.expiresAt ? `${daysLeft(u.expiresAt)} DAYS LEFT` : 'LIFETIME ACCESS'}
                            </p>
                            <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]">Expiration</p>
                          </div>

                          <div className="flex items-center gap-2">
                            {confirmId === u.id ? (
                              <button 
                                onClick={() => deleteUser(u.id)}
                                className="bg-red-500 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-colors"
                              >
                                Delete?
                              </button>
                            ) : (
                              <button 
                                onClick={() => setConfirmId(u.id)}
                                className="p-3 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                            {confirmId === u.id && (
                              <button onClick={() => setConfirmId(null)} className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2">No</button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Mobile Usage Bar */}
                      <div className="md:hidden mt-6 pt-6 border-t border-white/5 space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/30">
                          <span>Data Consumed</span>
                          <span>{fmt(u.usedTraffic)} / {u.dataLimit > 0 ? fmt(u.dataLimit) : '∞'}</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${usagePct > 80 ? 'bg-red-500' : 'bg-emerald-500'} rounded-full`} style={{ width: `${Math.min(100, usagePct)}%` }} />
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}
