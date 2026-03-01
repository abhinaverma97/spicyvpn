"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Smartphone,
  Monitor,
  ChevronDown,
  Wifi,
  Clock,
} from "lucide-react";

type User = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type VpnConfig = {
  id: string;
  uuid: string;
  token: string;
  importLink: string;
  expiresAt: string;
  active: boolean;
  createdAt: string;
};

export default function Dashboard({ user }: { user: User }) {
  const [config, setConfig] = useState<VpnConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    const res = await fetch("/api/vpn");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      setConfig(data[0]);
    }
  }

  async function generateConfig() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vpn", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfig(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate config");
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!config) return;
    navigator.clipboard.writeText(config.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyImportLink() {
    if (!config) return;
    navigator.clipboard.writeText(config.importLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-white" />
            <span className="font-semibold tracking-tight">SpicyVPN</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white/70 hover:text-white">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={user.image ?? ""} />
                  <AvatarFallback className="text-xs bg-white/10">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:block">{user.name}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
              <DropdownMenuItem
                className="text-white/70 hover:text-white cursor-pointer"
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
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-bold mb-1">Your VPN Config</h1>
          <p className="text-white/40 text-sm">
            One link. Any device. 30 days of stealth access.
          </p>
        </div>

        {!config ? (
          <Card className="bg-zinc-900 border-white/10 text-center py-16">
            <CardContent className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Wifi className="w-7 h-7 text-white/30" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">No config yet</h3>
                <p className="text-white/40 text-sm mb-6">
                  Generate your personal VPN config to get started.
                </p>
              </div>
              <Button
                onClick={generateConfig}
                disabled={loading}
                className="bg-white text-black hover:bg-white/90 px-8"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  "Generate my VPN config"
                )}
              </Button>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {/* Status card */}
            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">Status</CardTitle>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-white/30" />
                    <div>
                      <p className="text-xs text-white/30">Expires in</p>
                      <p className="text-sm font-medium">{daysLeft(config.expiresAt)} days</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-white/30" />
                    <div>
                      <p className="text-xs text-white/30">Encryption</p>
                      <p className="text-sm font-medium">End-to-end</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Token card */}
            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Your Access Token</CardTitle>
                <CardDescription className="text-white/40 text-xs">
                  Paste this token into the SpicyVPN app to connect
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-black rounded-lg p-5 flex items-center justify-between border border-white/10">
                  <code className="text-xl font-mono font-bold tracking-widest text-white">
                    {config.token}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyLink}
                    className="shrink-0 text-white/50 hover:text-white ml-4"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <Button
                  onClick={copyLink}
                  className="w-full bg-white text-black hover:bg-white/90"
                >
                  {copied ? (
                    <><Check className="w-4 h-4 mr-2" /> Copied!</>
                  ) : (
                    <><Copy className="w-4 h-4 mr-2" /> Copy token</>
                  )}
                </Button>
                {/* Advanced: raw import link */}
                <details className="group">
                  <summary className="text-xs text-white/20 cursor-pointer hover:text-white/40 select-none">
                    Advanced — manual import link
                  </summary>
                  <div className="mt-3 bg-black rounded-lg p-3 flex items-start gap-3 border border-white/10">
                    <code className="text-xs text-white/40 break-all flex-1 font-mono leading-relaxed">
                      {config.importLink}
                    </code>
                    <Button size="sm" variant="ghost" onClick={copyImportLink} className="shrink-0 text-white/30 hover:text-white">
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </details>
              </CardContent>
            </Card>

            {/* Setup instructions */}
            <Card className="bg-zinc-900 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Setup Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3 text-white/60">
                      <Smartphone className="w-4 h-4" />
                      <span className="text-sm font-medium">Android / iOS</span>
                    </div>
                    <ol className="space-y-2 text-sm text-white/40">
                      <li>1. Download <span className="text-white/70">v2rayNG</span> (Android) or <span className="text-white/70">Hiddify</span> (iOS)</li>
                      <li>2. Tap the + button</li>
                      <li>3. Choose &quot;Import from clipboard&quot;</li>
                      <li>4. Paste the link above</li>
                      <li>5. Tap Connect ✓</li>
                    </ol>
                  </div>
                  <Separator className="md:hidden bg-white/10" />
                  <div>
                    <div className="flex items-center gap-2 mb-3 text-white/60">
                      <Monitor className="w-4 h-4" />
                      <span className="text-sm font-medium">Windows / Mac</span>
                    </div>
                    <ol className="space-y-2 text-sm text-white/40">
                      <li>1. Download <span className="text-white/70">v2rayN</span> (Win) or <span className="text-white/70">Hiddify</span> (Mac)</li>
                      <li>2. Click Add server</li>
                      <li>3. Choose &quot;Import from clipboard&quot;</li>
                      <li>4. Paste the link above</li>
                      <li>5. Click Connect ✓</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
