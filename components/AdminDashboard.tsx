"use client";

import { useEffect, useState, useCallback } from "react";
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
  expiresAt: string | null;
  active: boolean;
  usedTraffic: number;
  dataLimit: number;
};

type VpsStats = {
  cpu: { pct: number; load: string; cores: number };
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

export default function AdminDashboard({ users: initialUsers, initialNodes = [] }: { users: User[], initialNodes?: any[] }) {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers.slice(0, 50));
  const [nodes, setNodes] = useState<any[]>(initialNodes);
  const [vps, setVps] = useState<VpsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "live" | "new" | "active">("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "nodes">("users");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeSubsCount, setActiveSubsCount] = useState(0);
  const [liveUsersCount, setLiveUsersCount] = useState(0);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (filterType !== "all") params.set("filter", filterType);
      if (filterType === "new") params.set("sort", "newest");

      const [vpsRes, usersRes, nodesRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch(`/api/admin?${params}`),
        fetch("/api/admin/nodes")
      ]);

      if (vpsRes.ok) setVps(await vpsRes.json());
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setActiveSubsCount(data.activeSubsCount || 0);
        setLiveUsersCount(data.liveUsersCount || 0);
      }
      if (nodesRes.ok) {
        const data = await nodesRes.json();
        setNodes(data);
      }
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterType]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [refreshData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (mounted) setPage(1);
  }, [filterType, debouncedSearch]);

  function handleFilterChange(newFilter: typeof filterType) {
    setFilterType(newFilter);
  }

  function handlePageChange(newPage: number) {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }

  async function deleteUser(id: string) {
    await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setUsers(u => u.filter(x => x.id !== id));
    setConfirmId(null);
  }

  async function deleteNode(id: string) {
    if (id === "node-1") {
      alert("Cannot delete the master node.");
      return;
    }
    await fetch("/api/admin/nodes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNodes(n => n.filter(x => x.id !== id));
    setConfirmId(null);
  }

  async function toggleNodeStatus(id: string, currentStatus: string) {
    if (id === "node-1") {
      alert("Cannot disable the master node.");
      return;
    }
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const res = await fetch("/api/admin/nodes", { 
      method: "PATCH", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ id, status: newStatus }) 
    });
    
    if (res.ok) {
      setNodes(n => n.map(x => x.id === id ? { ...x, status: newStatus } : x));
    }
  }

  async function addNode() {
    setLoading(true);
    try {
      const name = prompt("Enter Node Name (e.g., Singapore-ARM-1):");
      if (!name) return;
      const ip = prompt("Enter Node Public IP:");
      if (!ip) return;

      const res = await fetch("/api/admin/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ip })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Node created successfully!\n\nRun this command on your VPS:\n\n${data.installCommand}`);
      } else {
        alert("Failed to create node.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function daysLeft(expiresAt: any) {
    if (!expiresAt) return -1;
    const expiryMs = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime();
    const diff = expiryMs - Date.now();
    if (diff < 0) return -2; // Expired
    return Math.floor(diff / (1000 * 60 * 60 * 24)); // Will be 0 if diff > 0 but < 24 hours
  }

  if (!mounted) return null;

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
                onClick={addNode}
                className="bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 h-8 text-[10px] font-bold uppercase tracking-widest mr-2"
              >
                + Add Node
              </Button>
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
              <p className="text-white/40 text-lg uppercase tracking-widest text-xs font-bold mb-4">Full Fleet Management & Node Telemetry</p>
              
              <div className="flex gap-4 border-b border-white/10">
                <button 
                  onClick={() => setActiveTab("users")}
                  className={`pb-2 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'users' ? 'border-b-2 border-emerald-400 text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
                >
                  Registry
                </button>
                <button 
                  onClick={() => setActiveTab("nodes")}
                  className={`pb-2 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'nodes' ? 'border-b-2 border-emerald-400 text-emerald-400' : 'text-white/40 hover:text-white/70'}`}
                >
                  Nodes ({nodes.length})
                </button>
              </div>
            </div>
            
            {/* Engine Stats */}
            <div className="flex gap-10">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Engine Load</span>
                <div className="text-xl font-bold text-white/80">{vps?.cpu.pct || 0}% <span className="text-[10px] text-white/20">CPU</span></div>
                <div className="text-[11px] font-mono text-white/30">Load {vps?.cpu.load || '0.00'}</div>
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

          {/* Tab Content */}
          {activeTab === "users" ? (
            <GlassCard className="overflow-hidden border-white/5" intensity={0.08}>
              <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <Users className="w-5 h-5 text-white/30" /> Users
                </h2>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <select 
                    value={filterType}
                    onChange={e => handleFilterChange(e.target.value as any)}
                    className="bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white/70 focus:border-white/20 outline-none transition-all cursor-pointer min-w-[160px]"
                  >
                    <option value="all">All ({total})</option>
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
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
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
                    {users.map((u, i) => {
                      const isLive = vps?.liveUsers?.includes(u.token as string);
                      const limit = u.dataLimit || (50 * 1024 * 1024 * 1024);
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
                                <span className="text-white/10 uppercase tracking-tighter italic">Cap {Math.floor(u.dataLimit / 1024 / 1024 / 1024)} GB</span>
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
                              <p className={`text-xs font-bold ${daysLeft(u.expiresAt) === -2 || (daysLeft(u.expiresAt) !== -1 && daysLeft(u.expiresAt) < 3) ? 'text-red-400' : 'text-white/70'}`}>
                                {daysLeft(u.expiresAt) === -1 ? 'NO PLAN' : daysLeft(u.expiresAt) === -2 ? 'EXPIRED' : daysLeft(u.expiresAt) === 0 ? '< 24 HOURS' : `${daysLeft(u.expiresAt)} DAYS`}
                              </p>
                              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-0.5">Remaining</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right pr-6">
                            <div className="flex items-center justify-end">
                              {confirmId === u.id ? (
                                <div className="flex items-center gap-2 animate-in zoom-in-95">
                                  <button onClick={() => deleteUser(u.id)} className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-widest">Revoke</button>
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
              
              {users.length === 0 && (
                <div className="p-24 text-center flex flex-col items-center gap-4 opacity-30">
                  <Shield className="w-12 h-12 mb-2" />
                  <p className="text-sm font-bold uppercase tracking-widest">Registry Search Empty</p>
                </div>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                  <div className="text-[11px] text-white/30 font-mono">
                    {total === 0 ? '0 users' : `Showing ${(page - 1) * 50 + 1}-${Math.min(page * 50, total)} of ${total} users`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg border border-white/5 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    >
                      Prev
                    </button>
                    {(() => {
                      const pages: (number | string)[] = [];
                      const maxVisible = 5;
                      let start = Math.max(1, page - Math.floor(maxVisible / 2));
                      let end = Math.min(totalPages, start + maxVisible - 1);
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }
                      if (start > 1) pages.push("...");
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (end < totalPages) pages.push("...");
                      return pages.map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="text-white/20 text-[11px] px-1">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p as number)}
                            className={`w-7 h-7 text-[11px] font-bold rounded-lg transition-all ${
                              p === page
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      );
                    })()}
                    <button
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg border border-white/5 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          ) : (
            <GlassCard className="overflow-hidden border-white/5" intensity={0.08}>
              <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-white/30" /> Active Nodes
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-white/5 border-b border-white/5">
                    <tr className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                      <th className="px-6 py-3">Node Identity</th>
                      <th className="px-6 py-3 text-center">Status</th>
                      <th className="px-6 py-3">Load (CPU/RAM)</th>
                      <th className="px-6 py-3">Bandwidth</th>
                      <th className="px-6 py-3 text-right">Assigned Users</th>
                      <th className="px-6 py-3 text-right pr-6">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {nodes.map((n, i) => {
                      const isNodeLive = n.status === 'active' && ((Date.now() / 1000) - n.lastHeartbeat) < 120;
                      return (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white/90 truncate flex items-center gap-2">
                                {n.name}
                                {n.id === 'node-1' && <Badge className="bg-blue-500/10 text-blue-400 text-[8px] uppercase px-1.5 py-0">Master</Badge>}
                              </p>
                              <p className="text-[10px] text-white/30 truncate font-mono">{n.ip}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {n.status === 'disabled' ? (
                              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                                Disabled
                              </Badge>
                            ) : isNodeLive ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                                Online
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                                Offline
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-1 w-20">
                                <span className="text-[9px] text-white/30 uppercase font-bold">CPU {Math.round(n.cpuUsage || 0)}%</span>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-white/40" style={{ width: `${n.cpuUsage || 0}%` }} />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 w-20">
                                <span className="text-[9px] text-white/30 uppercase font-bold">RAM {Math.round(n.ramUsage || 0)}%</span>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-white/40" style={{ width: `${n.ramUsage || 0}%` }} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-bold text-white/90">{fmt(n.assignedTraffic)}</span>
                              <span className="text-[9px] text-white/30 uppercase font-bold">Total Handled</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex flex-col items-end">
                              <p className="text-sm font-bold text-white/90">{n.liveUsers || 0}</p>
                              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Live</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right pr-6">
                            {n.id !== 'node-1' && (
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => toggleNodeStatus(n.id, n.status)} 
                                  className="text-[9px] font-bold text-white/40 hover:text-white bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:bg-white/10 transition-all uppercase tracking-widest"
                                >
                                  {n.status === 'active' ? 'Disable' : 'Enable'}
                                </button>
                                {confirmId === n.id ? (
                                  <div className="flex items-center gap-2 animate-in zoom-in-95">
                                    <button onClick={() => deleteNode(n.id)} className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-widest">Delete</button>
                                    <button onClick={() => setConfirmId(null)} className="text-[9px] font-bold text-white/30 uppercase px-2">Esc</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmId(n.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </main>
        
        <Footer />
      </div>
    </div>
  );
}
