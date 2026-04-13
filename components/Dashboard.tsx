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
  ExternalLink,
  Users,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import Footer from "./Footer";
import SpotlightCard from "./SpotlightCard";
import GlassCard from "./GlassCard";
import dynamic from "next/dynamic";

const Dither = dynamic(() => import("./Dither"), { ssr: false });

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
  expiresAt: string;
  active: boolean;
  createdAt: string;
  usedTraffic: number;
  dataLimit: number;
  deviceCount: number;
};

export default function Dashboard({ user }: { user: User }) {
  const [config, setConfig] = useState<VpnConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedSub, setCopiedSub] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/vpn");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setConfig(data[0]);
      }
    } catch (e) {
      console.error("Failed to fetch config");
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
    } catch (e: any) {
      setError(e.message || "Failed to generate config");
    } finally {
      setLoading(false);
    }
  }

  function subUrl() {
    if (!config) return "";
    return `https://spicypepper.app/api/sub?token=${config.token}`;
  }

  function copySubUrl() {
    navigator.clipboard.writeText(subUrl());
    setCopiedSub(true);
    setTimeout(() => setCopiedSub(false), 2000);
  }

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??";

  const isExpired = config ? daysLeft(config.expiresAt) <= 0 : false;
  const isDataExhausted = config ? config.usedTraffic >= 35 * 1073741824 : false;
  const isInactive = config ? config.active === false : false;
  const needsRenewal = isExpired || isDataExhausted || isInactive;

  return (
    <div className="relative min-h-screen bg-black text-white overflow-x-hidden no-scrollbar">
      {/* Background Dither - Very Dim (Hidden on Mobile) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40 hidden sm:block">
        <Dither />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav */}
        <nav className="border-b border-white/10 px-6 py-4 backdrop-blur-md bg-black/20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <span className="font-semibold tracking-tight">SpicyVPN</span>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white/70 hover:text-white">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={user.image ?? ""} />
                  <AvatarFallback className="text-base bg-white/10">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-base hidden sm:block">{user.name}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white">
              {user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
                <DropdownMenuItem
                  className="hover:bg-white/10 cursor-pointer"
                  onClick={() => window.location.href = "/admin"}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </DropdownMenuItem>
              )}
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
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">


        <div className="mb-10">
          <h1 className="text-3xl font-black mb-2 tracking-tight">Your VPN Access</h1>
          <p className="text-white/40 text-lg">
            {needsRenewal ? "Your previous plan has ended. Generate a new one below." : "Copy your subscription link and import it into Hiddify or SpicyVPN Desktop."}
          </p>
        </div>

        {!config || needsRenewal ? (
          <GlassCard intensity={0.1} className="text-center py-20 border-white/5">
            <div className="flex flex-col items-center gap-8">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl backdrop-blur-xl">
                <Wifi className="w-10 h-10 text-white/30" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">{needsRenewal ? "Plan Ended" : "No config yet"}</h3>
                <p className="text-white/40 text-lg mb-8 max-w-sm mx-auto">
                  {needsRenewal ? (isDataExhausted ? "You have reached your 35GB data limit." : "Your 30-day time limit has expired.") : "Generate your personal access link to get started with SpicyVPN."}
                </p>
                <Button
                  onClick={generateConfig}
                  disabled={loading}
                  className="bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border border-white/10 px-10 py-6 text-base font-bold rounded-xl shadow-xl transition-all hover:scale-105 active:scale-95"
                >
                  {loading ? (
                    <><RefreshCw className="w-5 h-5 mr-3 animate-spin" /> Generating...</>
                  ) : (
                    needsRenewal ? "Renew Access Link" : "Generate my access link"
                  )}
                </Button>
              </div>
            </div>
          </GlassCard>
        ) : (
          <div className="grid gap-8">

            {/* Stats Row - Glass Tiles */}
            <div className="grid grid-cols-2 gap-6">
              <GlassCard className="p-8 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                <div className="text-5xl font-black tracking-tighter text-white/90 leading-none">{daysLeft(config.expiresAt)}</div>
                <div className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Days Remaining</div>
              </GlassCard>

              <GlassCard className="p-8 flex flex-col items-center justify-center text-center space-y-3 border-white/5" intensity={0.05}>
                <div className="text-5xl font-black tracking-tighter text-white/90 leading-none">
                  {Math.max(0, (35 * 1073741824 - config.usedTraffic) / 1073741824).toFixed(1)}
                  <span className="text-2xl text-white/20 ml-1">GB</span>
                </div>
                <div className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Data Left</div>
              </GlassCard>
            </div>

            {/* Subscription Link */}
            <GlassCard className="p-8 space-y-6 border-white/5" intensity={0.08}>
              <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white/90 mb-1">Subscription Link</h2>
                  <p className="text-white/40 text-base">
                    Copy this link and import it into Hiddify or SpicyVPN Desktop.
                  </p>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-4 py-1.5 text-sm font-bold shrink-0">
                  <Check className="w-4 h-4 mr-2" /> Active
                </Badge>
              </div>
              
              <div className="space-y-4">
                <div className="bg-black/40 rounded-xl p-5 flex items-center justify-between border border-white/5 gap-4 backdrop-blur-md">
                  <code className="text-base font-mono text-white/50 break-all leading-relaxed flex-1">
                    {subUrl()}
                  </code>
                  <button
                    onClick={copySubUrl}
                    className="shrink-0 text-white/30 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
                  >
                    {copiedSub ? <Check className="w-6 h-6 text-emerald-400" /> : <Copy className="w-6 h-6" />}
                  </button>
                </div>
                <Button
                  onClick={copySubUrl}
                  className="w-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border border-white/10 font-black py-7 text-lg rounded-xl shadow-2xl transition-all transform active:scale-[0.98]"
                >
                  {copiedSub ? (
                    <><Check className="w-6 h-6 mr-3 text-emerald-400" /> Copied to clipboard!</>
                  ) : (
                    <><Copy className="w-6 h-6 mr-3 text-white/60" /> Copy subscription link</>
                  )}
                </Button>
              </div>
            </GlassCard>

            {/* WhatsApp Community Card - Premium Glass Style */}
            <GlassCard 
              spotlightColor="transparent" 
              className="p-8 flex flex-col md:flex-row items-center justify-between gap-8 border-white/5"
              intensity={0.05}
              blur="16px"
            >
              <div className="flex items-center gap-6 text-center md:text-left flex-col md:flex-row">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 shadow-xl backdrop-blur-md">
                  <MessageCircle className="w-8 h-8 text-white/60" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold tracking-tight text-white/90">WhatsApp Community</h3>
                  <p className="text-base text-white/40 max-w-lg leading-relaxed">
                    Join our official WhatsApp group for real-time support, updates, and community discussions. 
                  </p>
                </div>
              </div>
              <a
                href="https://chat.whatsapp.com/GbbhA373kNtFQwqvXItwZF"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full md:w-auto"
              >
                <Button className="w-full md:w-auto bg-white/[0.03] hover:bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:border-emerald-400/50 font-bold h-14 px-10 text-base transition-all duration-300 rounded-xl group backdrop-blur-md">
                  Join WhatsApp Community
                  <ExternalLink className="w-4 h-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform opacity-50 group-hover:opacity-100" />
                </Button>
              </a>
            </GlassCard>

            {/* Guides Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

            {/* How to connect */}
            <GlassCard className="flex flex-col h-full border-white/5" intensity={0.05}>
              <div className="p-8 pb-4">
                <h3 className="text-xl font-bold text-white/90 mb-1">How to connect</h3>
                <p className="text-white/40 text-base">
                  Use <span className="text-white/70 font-bold underline decoration-white/20">Hiddify</span> or our SpicyVPN Desktop App
                </p>
              </div>
              
              <div className="p-8 pt-0 space-y-8">
                {/* Android */}
                <div className="group/item">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-white/20 transition-colors">
                      <Smartphone className="w-4 h-4 text-white/40" />
                    </div>
                    <span className="text-lg font-bold text-white/80">Android</span>
                    <a
                      href="https://play.google.com/store/apps/details?id=app.hiddify.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:border-white/30 hover:text-white transition-all bg-white/5"
                    >
                      Google Play
                    </a>
                  </div>
                  <ol className="space-y-2 text-base text-white/30 ml-4 border-l border-white/5 pl-6">
                    <li>1. Install <span className="text-white/60 font-medium">Hiddify</span> from Play Store</li>
                    <li>2. Copy your link from the box above</li>
                    <li>3. Open Hiddify → tap <span className="text-white/60 font-medium">+</span> → <span className="text-white/60 font-medium">Add from clipboard</span></li>
                    <li>4. Tap <span className="text-white/60 font-medium">Connect</span></li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* Windows */}
                <div className="group/item">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-white/20 transition-colors">
                      <Monitor className="w-4 h-4 text-white/40" />
                    </div>
                    <span className="text-lg font-bold text-white/80">Windows</span>
                    <div className="ml-auto flex gap-2">
                      <a
                        href="https://github.com/abhinaverma97/spicyvpn-desktop/releases/download/v0.2.37/SpicyVPN_0.1.0_x64-setup.exe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold px-4 py-2 rounded-xl border border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40 hover:text-emerald-300 transition-all bg-emerald-500/5"
                      >
                        Download SpicyVPN
                      </a>
                    </div>
                  </div>
                  <ol className="space-y-2 text-base text-white/30 ml-4 border-l border-white/5 pl-6">
                    <li>1. Install <span className="text-white/60 font-medium">SpicyVPN Desktop</span></li>
                    <li>2. Copy your subscription link from the box above</li>
                    <li>3. Paste into the app and click <span className="text-white/60 font-medium">Save Gateway</span></li>
                    <li>4. Click <span className="text-white/60 font-medium">Connect</span></li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* macOS */}
                <div className="group/item">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-white/20 transition-colors">
                      <Monitor className="w-4 h-4 text-white/40" />
                    </div>
                    <span className="text-lg font-bold text-white/80">macOS</span>
                    <a
                      href="https://github.com/hiddify/hiddify-app/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:border-white/30 hover:text-white transition-all bg-white/5"
                    >
                      Download Hiddify
                    </a>
                  </div>
                  <ol className="space-y-2 text-base text-white/30 ml-4 border-l border-white/5 pl-6">
                    <li>1. Install <span className="text-white/60 font-medium">Hiddify</span> for Mac</li>
                    <li>2. Copy your link, open Hiddify and click <span className="text-white/60 font-medium">+</span></li>
                    <li>3. Select <span className="text-white/60 font-medium">Add from clipboard</span></li>
                    <li>4. Click <span className="text-white/60 font-medium">Connect</span></li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* iOS */}
                <div className="group/item">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-white/20 transition-colors">
                      <Smartphone className="w-4 h-4 text-white/40" />
                    </div>
                    <span className="text-lg font-bold text-white/80">iPhone / iPad</span>
                    <a
                      href="https://apps.apple.com/app/hiddify-proxy-vpn/id6596777532"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:border-white/30 hover:text-white transition-all bg-white/5"
                    >
                      App Store
                    </a>
                  </div>
                  <ol className="space-y-2 text-base text-white/30 ml-4 border-l border-white/5 pl-6">
                    <li>1. Get <span className="text-white/60 font-medium">Hiddify</span> from App Store</li>
                    <li>2. Copy your link and import it into the app</li>
                    <li>3. Tap <span className="text-white/60 font-medium">Connect</span></li>
                  </ol>
                </div>
              </div>
            </GlassCard>

            {/* Games & System Apps */}
            <GlassCard className="hidden md:flex flex-col h-full border-white/5" intensity={0.05}>
              <div className="p-8 pb-4">
                <h3 className="text-xl font-bold text-white/90 mb-1">🎮 For games & system apps</h3>
                <p className="text-white/40 text-base leading-relaxed">Discord, Valorant, and any UDP app — enable VPN mode for full system routing</p>
              </div>
              <div className="p-8 pt-0 space-y-6 flex-1">
                <p className="text-base text-white/30 leading-relaxed italic border-l-2 border-white/10 pl-4">
                  By default Hiddify runs as a proxy — games and apps using UDP won&apos;t go through it. 
                  Enable <span className="text-white/60 font-bold">VPN mode</span> to route all traffic.
                </p>
                <ol className="space-y-6 text-base text-white/40">
                  <li className="flex gap-4">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">1</span>
                    <span><span className="text-white/70 font-bold">Run Hiddify as administrator</span> (Right-click on desktop icon)</span>
                  </li>
                  <li className="space-y-3">
                    <div className="flex gap-4">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">2</span>
                      <span>Click the <span className="text-white/70 font-bold">sliders icon</span> (top-right, next to the + button)</span>
                    </div>
                    <div className="ml-10 relative group/img">
                      <div className="absolute -inset-1 bg-white/10 rounded-xl blur opacity-0 group-hover/img:opacity-100 transition-opacity"></div>
                      <img src="/hiddify-mode-step1.jpg" alt="Click sliders icon" className="relative rounded-lg border border-white/10 w-full max-w-sm" />
                    </div>
                  </li>
                  <li className="space-y-3">
                    <div className="flex gap-4">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">3</span>
                      <span>Select <span className="text-white/70 font-bold">VPN</span> from the mode options</span>
                    </div>
                    <div className="ml-10 relative group/img">
                      <div className="absolute -inset-1 bg-white/10 rounded-xl blur opacity-0 group-hover/img:opacity-100 transition-opacity"></div>
                      <img src="/hiddify-mode-step2.jpg" alt="Select VPN mode" className="relative rounded-lg border border-white/10 w-full max-w-sm" />
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold border border-white/10">4</span>
                    <span className="text-white/60">Connect as usual — all apps now route through SpicyVPN</span>
                  </li>
                </ol>
              </div>
            </GlassCard>

            </div> {/* end grid */}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <p className="text-base text-amber-400 font-medium">
                Chrome/Brave might have issues, use Firefox.
              </p>
            </div>

            <div className="flex items-center gap-3 px-1">
              <Clock className="w-3.5 h-3.5 text-white/20" />
              <span className="text-base text-white/20">
                Config expires {new Date(config.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
              <Shield className="w-3.5 h-3.5 text-white/20 ml-auto" />
              <span className="text-base text-white/20">Secured with Hysteria 2</span>
            </div>

          </div>
        )}
      </main>
      <Footer />
      </div>
    </div>
  );
}
