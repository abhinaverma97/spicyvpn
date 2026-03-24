"use client";

import { useEffect, useState } from "react";
import { Shield, Users, Wifi, Clock, AlertCircle, Cpu, HardDrive, Activity, ArrowDown, ArrowUp, Trash2, Server, Plus, Power, Key } from "lucide-react";
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
  lastActive: number | null;
};

type Node = {
  id: string;
  name: string;
  ip: string;
  apiKey: string;
  maxCapacity: number;
  currentLoad: number;
  status: string;
  lastHeartbeat: number;
  createdAt: number;
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

export default function AdminDashboard({ stats, users: initialUsers, nodes: initialNodes = [] }: { stats: Stats; users: User[]; nodes?: Node[] }) {
  console.log("[AdminDashboard] Rendering component...");
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [vps, setVps] = useState<VpsStats | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sortByLive, setSortByLive] = useState(false);
  
  // Node UI State
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeIp, setNewNodeIp] = useState("");
  const [installCommand, setInstallCommand] = useState("");

  async function deleteUser(id: string) {
    setDeleting(id);
    await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setUsers(u => u.filter(x => x.id !== id));
    setDeleting(null);
    setConfirmId(null);
  }

  async function fetchNodes() {
    try {
      const res = await fetch("/api/admin/nodes");
      if (res.ok) {
        setNodes(await res.json());
      } else {
        console.error(`Failed to fetch nodes: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error("Error fetching nodes:", err);
    }
  }

  useEffect(() => {
    setMounted(true);
    console.log("[AdminDashboard] Initialized with users:", initialUsers?.length, "nodes:", initialNodes?.length);
    
    async function fetchVps() {
      try {
        console.log("[AdminDashboard] Fetching VPS stats...");
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          const data = await res.json();
          console.log("[AdminDashboard] VPS stats received:", data);
          setVps(data);
        } else {
          console.error(`[AdminDashboard] Failed to fetch VPS stats: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        console.error("[AdminDashboard] Error fetching VPS stats:", err);
      }
    }

    async function fetchNodes() {
      try {
        console.log("[AdminDashboard] Fetching nodes...");
        const res = await fetch("/api/admin/nodes");
        if (res.ok) {
          const data = await res.json();
          console.log("[AdminDashboard] Nodes received:", data);
          setNodes(data);
        } else {
          console.error(`[AdminDashboard] Failed to fetch nodes: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        console.error("[AdminDashboard] Error fetching nodes:", err);
      }
    }

    async function fetchUsers() {
      try {
        console.log("[AdminDashboard] Fetching users...");
        const res = await fetch("/api/admin");
        if (res.ok) {
          const data = await res.json();
          console.log("[AdminDashboard] Users raw data received:", data?.length, "records");
          const mapped = data.map((u: any) => ({
            ...u,
            joinedAt: u.createdAt ? new Date(u.createdAt * 1000).toISOString() : new Date().toISOString(),
            active: Boolean(u.active),
            expiresAt: u.expiresAt ? new Date(u.expiresAt * 1000).toISOString() : null,
            lastActive: Number(u.lastActive || 0),
          }));
          console.log("[AdminDashboard] Users mapped. First user lastActive:", mapped[0]?.lastActive);
          setUsers(mapped);
        } else {
          console.error(`[AdminDashboard] Failed to fetch users: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        console.error("[AdminDashboard] Error fetching users:", err);
      }
    }
    
    fetchVps();
    fetchNodes();
    fetchUsers();
    
    const interval = setInterval(() => {
        console.log("[AdminDashboard] Polling for updates...");
        fetchVps();
        fetchNodes();
        fetchUsers();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleAddNode(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newNodeName, ip: newNodeIp })
    });
    
    if (res.ok) {
      const data = await res.json();
      const domain = window.location.origin;
      const cmd = `sudo bash -c "curl -sSL ${domain}/setup-node.sh | bash -s -- '${domain}' '${data.apiKey}'"`;
      setInstallCommand(cmd);
      fetchNodes();
    }
  }

  async function toggleNodeStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    await fetch("/api/admin/nodes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus })
    });
    fetchNodes();
  }

  async function deleteNode(id: string) {
    if (!confirm("Are you sure you want to delete this node?")) return;
    await fetch("/api/admin/nodes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });
    fetchNodes();
  }

  function daysLeft(expiresAt: any) {
    if (!expiresAt) return 0;
    const expiry = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime();
    const diff = expiry - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const usedPct = Math.round((stats.totalUsers / stats.capacity) * 100);

  if (!mounted) return null;

  const now = Math.floor(Date.now() / 1000);

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortByLive) return 0;
    
    const aIsLive = a.lastActive && (now - a.lastActive) < 90 ? 1 : 0;
    const bIsLive = b.lastActive && (now - b.lastActive) < 90 ? 1 : 0;
    
    if (aIsLive !== bIsLive) {
      return bIsLive - aIsLive;
    }
    
    // If both are live or both are not live, sort by more recent activity
    const aTime = a.lastActive || 0;
    const bTime = b.lastActive || 0;
    return bTime - aTime;
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

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
        
        {/* Fleet Section */}
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold mb-1">Node Fleet</h1>
                    <p className="text-white/30 text-sm">Global distributed network servers.</p>
                </div>
                <Button 
                    onClick={() => setShowAddNode(!showAddNode)}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                >
                    <Plus className="w-4 h-4 mr-2" /> Add Server
                </Button>
            </div>

            {showAddNode && (
                <Card className="bg-zinc-900 border-white/10 p-6">
                    {installCommand ? (
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-emerald-400">Node Created!</h3>
                            <p className="text-sm text-white/60">SSH into your new VPS as root and run this exact command. It will automatically download, install, and configure everything.</p>
                            <div className="bg-black p-4 rounded-lg border border-white/10 font-mono text-xs text-white/80 overflow-x-auto">
                                {installCommand}
                            </div>
                            <Button onClick={() => { setShowAddNode(false); setInstallCommand(""); setNewNodeName(""); setNewNodeIp(""); }} variant="outline" className="w-full border-white/10 text-white/70">Done</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleAddNode} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-white/60 uppercase tracking-wider">Node Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. Singapore - Premium" 
                                        className="w-full bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                                        value={newNodeName}
                                        onChange={e => setNewNodeName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-white/60 uppercase tracking-wider">Public IPv4</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="140.245.x.x" 
                                        className="w-full bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                                        value={newNodeIp}
                                        onChange={e => setNewNodeIp(e.target.value)}
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20">Generate Installation Script</Button>
                        </form>
                    )}
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nodes.map(node => {
                    const isOnline = (Math.floor(Date.now() / 1000) - node.lastHeartbeat) < 120;
                    return (
                        <Card key={node.id} className={`bg-zinc-900 border-white/10 ${node.status === 'disabled' ? 'opacity-50' : ''}`}>
                            <CardHeader className="pb-2 flex flex-row items-start justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Server className="w-4 h-4 text-white/60" /> {node.name}
                                    </CardTitle>
                                    <p className="text-xs text-white/40 mt-1 font-mono">{node.ip}</p>
                                </div>
                                <div className="flex gap-2">
                                    {isOnline && node.status === 'active' ? (
                                        <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                                            Offline
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-white/40 mb-1">
                                        <span>Active Load</span>
                                        <span>{node.currentLoad} / {node.maxCapacity}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${node.currentLoad >= node.maxCapacity ? 'bg-red-400' : 'bg-blue-400'}`} 
                                            style={{ width: `${Math.min(100, (node.currentLoad / node.maxCapacity) * 100)}%` }} 
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                    <div className="flex items-center gap-2" title="API Key">
                                        <Key className="w-3 h-3 text-white/20" />
                                        <code className="text-[10px] text-white/30 truncate max-w-[100px]">{node.apiKey.substring(0,8)}...</code>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => toggleNodeStatus(node.id, node.status)} className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
                                            <Power className="w-3 h-3" /> {node.status === 'active' ? 'Disable' : 'Enable'}
                                        </button>
                                        <button onClick={() => deleteNode(node.id)} className="text-xs text-red-400/50 hover:text-red-400 transition-colors">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </section>

        {/* Overview Stats */}
        <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Network Overview</h2>
          <p className="text-white/30 text-sm">Combined stats across all nodes.</p>
        </div>

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
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Live connections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-white">
                {(users as any[]).filter(u => u.lastActive && (Math.floor(Date.now() / 1000) - u.lastActive) < 90).length}
              </p>
              <p className="text-xs text-white/30 mt-1">active unique users (last 90s)</p>
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
              <p className="text-xs text-white/30 mt-1">total generated</p>
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
        </section>

        {/* User table */}
        <section className="space-y-6">
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
                          {!!((u as any).lastActive && (Math.floor(Date.now() / 1000) - (u as any).lastActive) < 90) && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Connected" />
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
        </section>
      </main>
      <Footer />
    </div>
  );
}
