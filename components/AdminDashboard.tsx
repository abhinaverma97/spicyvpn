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
    if (!expiresAt) return -1;
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

  return (
    <div className="min-h-screen bg-[#000] text-[#fafafa] font-sans antialiased flex flex-col">
      {/* Top Navbar */}
      <nav className="border-b border-zinc-800 bg-[#09090b] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg tracking-tight uppercase">Admin Console</span>
          </div>
          <div className="hidden md:flex items-center gap-4 border-l border-zinc-800 pl-6">
            <button 
              onClick={() => window.location.href = "/dashboard"}
              className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" /> User Dashboard
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshData}
            className="hidden sm:flex bg-transparent border-zinc-800 hover:bg-zinc-900 text-zinc-400"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white hover:bg-zinc-900">
                <Avatar className="w-7 h-7 border border-zinc-700">
                  <AvatarFallback className="bg-zinc-800 text-xs">AD</AvatarFallback>
                </Avatar>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-white min-w-[150px]">
              <DropdownMenuItem onClick={() => window.location.href = "/dashboard"} className="md:hidden cursor-pointer">
                User Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-red-400 focus:text-red-400 cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        
        {/* Key Metrics Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#09090b] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Registered</span>
            <div className="text-3xl font-black text-white">{vps?.totalUsers || 0}</div>
          </div>
          <div className="bg-[#09090b] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Active Subs</span>
            <div className="text-3xl font-black text-emerald-400">{vps?.activeUsers || 0}</div>
          </div>
          <div className="bg-[#09090b] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Live Conn</span>
              <div className={`w-2 h-2 rounded-full ${liveCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
            </div>
            <div className="text-3xl font-black text-blue-400">{liveCount}</div>
          </div>
          <div className="bg-[#09090b] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Total TX</span>
            <div className="text-3xl font-black text-white">{fmt(vps?.totalTrafficBytes || 0)}</div>
          </div>
        </div>

        {/* User Registry List */}
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">User Registry</h2>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text"
                placeholder="Search database..."
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:border-zinc-600 outline-none transition-all placeholder:text-zinc-600"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-[#09090b] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[#111113] border-b border-zinc-800">
                  <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    <th className="px-6 py-4">Identity</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4">Data Volume</th>
                    <th className="px-6 py-4 text-right">Expiration</th>
                    <th className="px-6 py-4 text-right pr-6">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {sortedUsers.map((u, i) => {
                    const isLive = vps?.liveUsers?.includes(u.uuid as string);
                    // We know data limit is fixed at 35GB via the backend now, but we display what the frontend knows
                    const limit = 35 * 1024 * 1024 * 1024;
                    const usagePct = (u.usedTraffic / limit) * 100;
                    
                    return (
                      <tr key={i} className="group hover:bg-zinc-900/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${isLive ? 'bg-white border-white text-black' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
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
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold uppercase rounded px-2 py-0.5">Live</Badge>
                          ) : (
                            <Badge className="bg-transparent text-zinc-600 border-zinc-800 text-[9px] font-bold uppercase rounded px-2 py-0.5">Offline</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-40 space-y-1.5">
                            <div className="flex justify-between text-[11px] font-medium text-zinc-400">
                              <span>{fmt(u.usedTraffic)}</span>
                              <span>35 GB</span>
                            </div>
                            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full ${usagePct > 90 ? 'bg-red-500' : 'bg-zinc-300'}`} style={{ width: `${Math.min(100, usagePct)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className={`text-xs font-semibold ${daysLeft(u.expiresAt) !== -1 && daysLeft(u.expiresAt) < 3 ? 'text-red-400' : 'text-zinc-300'}`}>
                            {u.expiresAt ? `${daysLeft(u.expiresAt)} Days` : 'No Plan'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right pr-6">
                          <div className="flex items-center justify-end">
                            {confirmId === u.id ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => deleteUser(u.id)} className="text-[11px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded hover:bg-red-400/20 transition-colors">Confirm</button>
                                <button onClick={() => setConfirmId(null)} className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300 px-1">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmId(u.id)} className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors">
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
              <div className="p-12 text-center text-zinc-500 text-sm">
                No users found matching your search.
              </div>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
